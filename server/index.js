import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import {
  createSession, createUser, dataDir, deleteProject, deleteSession, getProject,
  getProjectInternal, insertProject, listProjects, rootDir, saveProjectState,
  sessionUser, userByEmail,
} from "./db.js";
import { extractDocument } from "./extract.js";
import { aiStatus, analyzeExtraction, diagramForProcess } from "./analyze.js";
import { ensureSamples, sampleById, samplesDir, SAMPLE_CATALOG } from "./samples.js";
import { HttpError, MAX_UPLOAD_BYTES, asyncRoute, readCookie } from "./http.js";

dotenv.config({ path: path.join(rootDir(), ".env") });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function cookieToken(res, token) {
  res.cookie("ld_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

function clearCookie(res) {
  res.clearCookie("ld_session", { path: "/" });
}

function requireUser(req, res, next) {
  const user = sessionUser(readCookie(req, "ld_session"));
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  req.user = user;
  next();
}

function safeFilename(name) {
  const base = path.basename(name || "upload").replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 120);
  return base || "upload";
}

async function storeUpload(userId, projectId, filename, buffer) {
  const dir = path.join(dataDir(), "uploads", userId, projectId);
  await fs.mkdir(dir, { recursive: true });
  const storedName = safeFilename(filename);
  await fs.writeFile(path.join(dir, storedName), buffer);
  return storedName;
}

async function removeStored(userId, projectId) {
  await fs.rm(path.join(dataDir(), "uploads", userId, projectId), { recursive: true, force: true });
}

function requireOverwrite(project, confirm) {
  if (project.diagram?.manuallyEdited && !confirm) {
    throw new HttpError(409, "This diagram has manual edits. Continuing will replace the diagram and those edits.", { needsConfirm: true });
  }
}

function sanitizeDiagram(diagram) {
  if (!diagram || !Array.isArray(diagram.lanes) || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges)) {
    throw new HttpError(400, "The diagram could not be saved.");
  }
  if (diagram.nodes.length > 400 || diagram.edges.length > 800 || diagram.lanes.length > 40) {
    throw new HttpError(400, "This diagram is too large to save.");
  }
  return {
    ...diagram,
    reviewStatus: diagram.reviewStatus === "reviewed" ? "reviewed" : "draft",
    manuallyEdited: Boolean(diagram.manuallyEdited),
  };
}

async function createFromBuffer(user, filename, buffer) {
  const extraction = await extractDocument(buffer, filename);
  const id = crypto.randomUUID();
  const storedName = await storeUpload(user.id, id, filename, buffer);
  return insertProject({
    id,
    userId: user.id,
    filename: safeFilename(filename),
    storedName,
    byteSize: buffer.length,
    versionInfo: extraction.versionInfo,
    extraction,
  });
}

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/register", asyncRoute(async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (name.length < 1 || name.length > 80) throw new HttpError(400, "Enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 8) throw new HttpError(400, "Use a password of at least 8 characters.");
  if (userByEmail(email)) throw new HttpError(409, "An account with that email already exists.");
  const id = crypto.randomUUID();
  createUser({ id, email, name, passwordHash: await bcrypt.hash(password, 10) });
  const token = randomBytes(24).toString("hex");
  createSession(token, id, Date.now() + 14 * 24 * 60 * 60 * 1000);
  cookieToken(res, token);
  res.json({ user: { id, email, name } });
}));

app.post("/api/login", asyncRoute(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = userByEmail(email);
  const match = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !match) throw new HttpError(401, "The email or password is not correct.");
  const token = randomBytes(24).toString("hex");
  createSession(token, user.id, Date.now() + 14 * 24 * 60 * 60 * 1000);
  cookieToken(res, token);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

app.post("/api/logout", (req, res) => {
  deleteSession(readCookie(req, "ld_session"));
  clearCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const user = sessionUser(readCookie(req, "ld_session"));
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  res.json({ user });
});

app.get("/api/config", requireUser, (_req, res) => {
  res.json(aiStatus());
});

app.get("/api/samples", requireUser, (_req, res) => {
  res.json({
    samples: SAMPLE_CATALOG.map((sample) => ({
      id: sample.id,
      format: sample.format,
      title: sample.title,
      summary: sample.summary,
    })),
  });
});

app.get("/api/samples/:id/file", requireUser, asyncRoute(async (req, res) => {
  const sample = sampleById(req.params.id);
  if (!sample) throw new HttpError(404, "That sample could not be found.");
  const filePath = path.join(samplesDir(), sample.file);
  res.download(filePath, sample.file);
}));

app.get("/api/projects", requireUser, (req, res) => {
  res.json({ projects: listProjects(req.user.id) });
});

app.post("/api/projects", requireUser, upload.single("file"), asyncRoute(async (req, res) => {
  if (!req.file) throw new HttpError(400, "Choose a Word or PDF file to upload.");
  const project = await createFromBuffer(req.user, req.file.originalname, req.file.buffer);
  res.json({ project });
}));

app.post("/api/projects/sample", requireUser, asyncRoute(async (req, res) => {
  const sample = sampleById(req.body?.sampleId);
  if (!sample) throw new HttpError(404, "That sample could not be found.");
  const buffer = await fs.readFile(path.join(samplesDir(), sample.file));
  const project = await createFromBuffer(req.user, sample.file, buffer);
  res.json({ project });
}));

app.get("/api/projects/:id", requireUser, (req, res) => {
  const project = getProject(req.params.id, req.user.id);
  if (!project) throw new HttpError(404, "That project could not be found.");
  res.json({ project });
});

app.delete("/api/projects/:id", requireUser, asyncRoute(async (req, res) => {
  const row = deleteProject(req.params.id, req.user.id);
  if (!row) throw new HttpError(404, "That project could not be found.");
  await removeStored(req.user.id, req.params.id);
  res.json({ ok: true });
}));

app.post("/api/projects/:id/analyze", requireUser, asyncRoute(async (req, res) => {
  const project = getProjectInternal(req.params.id, req.user.id);
  if (!project) throw new HttpError(404, "That project could not be found.");
  requireOverwrite(project, Boolean(req.body?.confirmOverwrite));
  const result = await analyzeExtraction(project.extractionFull);
  const saved = saveProjectState(project.id, req.user.id, {
    analysis: result.analysis,
    diagram: result.diagram,
    selectedProcessId: result.selectedProcessId,
  });
  res.json({ project: saved });
}));

app.post("/api/projects/:id/diagram/build", requireUser, asyncRoute(async (req, res) => {
  const project = getProjectInternal(req.params.id, req.user.id);
  if (!project) throw new HttpError(404, "That project could not be found.");
  if (!project.analysis) throw new HttpError(400, "Analyze the SOP before mapping a procedure.");
  requireOverwrite(project, Boolean(req.body?.confirmOverwrite));
  const built = diagramForProcess(project.analysis, req.body?.processId);
  const saved = saveProjectState(project.id, req.user.id, built);
  res.json({ project: saved });
}));

app.put("/api/projects/:id/diagram", requireUser, asyncRoute(async (req, res) => {
  const project = getProject(req.params.id, req.user.id);
  if (!project) throw new HttpError(404, "That project could not be found.");
  const diagram = sanitizeDiagram(req.body?.diagram);
  const saved = saveProjectState(project.id, req.user.id, { diagram });
  res.json({ project: saved });
}));

app.put("/api/projects/:id/review", requireUser, asyncRoute(async (req, res) => {
  const project = getProject(req.params.id, req.user.id);
  if (!project?.diagram) throw new HttpError(400, "There is no diagram to mark as reviewed.");
  const reviewStatus = req.body?.status === "reviewed" ? "reviewed" : "draft";
  const saved = saveProjectState(project.id, req.user.id, {
    diagram: { ...project.diagram, reviewStatus },
  });
  res.json({ project: saved });
}));

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "That request was not recognized." });
});

app.use((err, _req, res, _next) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "This file is larger than 10 MB. The upload limit is 10 MB." });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong while handling that request." });
});

const port = Number(process.env.PORT || 3000);

await ensureSamples();

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(rootDir(), "dist")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(rootDir(), "dist", "index.html"));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  const status = aiStatus();
  console.log(`Lane Draft is running at http://localhost:${port}`);
  if (!status.configured) {
    console.log("OPENAI_API_KEY is not set. Uploads can be reviewed, and diagram analysis will explain the missing setup.");
  }
});
