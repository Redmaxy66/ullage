import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
fs.mkdirSync(DATA, { recursive: true });

const db = new DatabaseSync(path.join(DATA, "lane-draft.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version_info TEXT,
    extraction TEXT,
    analysis TEXT,
    diagram TEXT,
    selected_process_id TEXT
  );
  CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);
`);

function parse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function rootDir() {
  return ROOT;
}

export function dataDir() {
  return DATA;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createUser({ id, email, name, passwordHash }) {
  db.prepare(`INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    id, email, name, passwordHash, nowIso(),
  );
}

export function userByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) ?? null;
}

export function userById(id) {
  return db.prepare(`SELECT id, email, name, created_at FROM users WHERE id = ?`).get(id) ?? null;
}

export function createSession(token, userId, expiresAt) {
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, userId, expiresAt);
}

export function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.id, users.email, users.name
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ?
  `).get(token, Date.now());
  if (!row) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
  return row ?? null;
}

export function deleteSession(token) {
  if (token) db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

function toPublic(row) {
  if (!row) return null;
  const extraction = parse(row.extraction);
  if (extraction) {
    delete extraction.fullText;
    if (Array.isArray(extraction.pages)) {
      extraction.pages = extraction.pages.map((page) => ({
        page: page.page,
        readable: page.readable,
        characters: page.characters,
      }));
    }
  }
  return {
    id: row.id,
    filename: row.filename,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versionInfo: parse(row.version_info),
    extraction,
    analysis: parse(row.analysis),
    diagram: parse(row.diagram),
    selectedProcessId: row.selected_process_id,
  };
}

export function insertProject({ id, userId, filename, storedName, byteSize, versionInfo, extraction }) {
  const stamp = nowIso();
  db.prepare(`
    INSERT INTO projects (
      id, user_id, filename, stored_name, byte_size, created_at, updated_at, version_info, extraction, analysis, diagram, selected_process_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
  `).run(id, userId, filename, storedName, byteSize, stamp, stamp, JSON.stringify(versionInfo ?? null), JSON.stringify(extraction));
  return getProject(id, userId);
}

export function getProject(id, userId) {
  return toPublic(db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId));
}

export function getProjectInternal(id, userId) {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) return null;
  return { ...toPublic(row), extractionFull: parse(row.extraction), storedName: row.stored_name };
}

export function listProjects(userId) {
  return db.prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC`).all(userId).map((row) => {
    const project = toPublic(row);
    return {
      id: project.id,
      filename: project.filename,
      byteSize: project.byteSize,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      versionInfo: project.versionInfo,
      reviewStatus: project.diagram?.reviewStatus || null,
      hasDiagram: Boolean(project.diagram),
      processCount: project.analysis?.processes?.length || 0,
      blocking: project.extraction?.blocking || null,
    };
  });
}

export function deleteProject(id, userId) {
  const row = db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!row) return null;
  db.prepare(`DELETE FROM projects WHERE id = ? AND user_id = ?`).run(id, userId);
  return row;
}

export function saveProjectState(id, userId, fields) {
  const current = db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).get(id, userId);
  if (!current) return null;
  const extraction = fields.extraction === undefined ? parse(current.extraction) : fields.extraction;
  const analysis = fields.analysis === undefined ? parse(current.analysis) : fields.analysis;
  const diagram = fields.diagram === undefined ? parse(current.diagram) : fields.diagram;
  const versionInfo = fields.versionInfo === undefined ? parse(current.version_info) : fields.versionInfo;
  db.prepare(`
    UPDATE projects SET
      extraction = ?, version_info = ?, analysis = ?, diagram = ?, selected_process_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    JSON.stringify(extraction),
    JSON.stringify(versionInfo ?? null),
    analysis ? JSON.stringify(analysis) : null,
    diagram ? JSON.stringify(diagram) : null,
    fields.selectedProcessId === undefined ? current.selected_process_id : fields.selectedProcessId,
    nowIso(),
    id,
    userId,
  );
  return getProject(id, userId);
}
