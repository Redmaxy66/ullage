const base = "http://localhost:3000";

function jar() {
  let cookie = "";
  return {
    async send(path, { method = "GET", body, form } = {}) {
      const headers = { cookie };
      let payload;
      if (form) payload = form;
      else if (body !== undefined) {
        headers["content-type"] = "application/json";
        payload = JSON.stringify(body);
      }
      const response = await fetch(base + path, { method, headers, body: payload });
      const raw = response.headers.getSetCookie?.() || [];
      for (const item of raw) {
        const pair = item.split(";")[0];
        if (pair.startsWith("ld_session=")) cookie = pair;
      }
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }
      return { status: response.status, data };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const a = jar();
const b = jar();
const stamp = Date.now();
const regA = await a.send("/api/register", { method: "POST", body: { name: "Avery Cole", email: `avery.${stamp}@example.com`, password: "correct-horse" } });
assert(regA.status === 200, `register A ${regA.status} ${JSON.stringify(regA.data)}`);
const regB = await b.send("/api/register", { method: "POST", body: { name: "Blair Diaz", email: `blair.${stamp}@example.com`, password: "correct-horse" } });
assert(regB.status === 200, `register B ${regB.status}`);

const docx = await a.send("/api/projects/sample", { method: "POST", body: { sampleId: "inbound-inspection-docx" } });
assert(docx.status === 200, `docx sample ${docx.status} ${docx.data.error}`);
assert(docx.data.project.extraction.actions.some((action) => action.stepNumber === "3.5"), "missing decision step");
assert(docx.data.project.extraction.notes.some((note) => /someone/i.test(note.message)), "missing ambiguous note");
assert(docx.data.project.versionInfo.version === "2.3", "missing version");

const pdf = await a.send("/api/projects/sample", { method: "POST", body: { sampleId: "pack-and-ship-pdf" } });
assert(pdf.status === 200, `pdf table ${pdf.status} ${pdf.data.error}`);
assert(pdf.data.project.extraction.blocks.some((block) => block.type === "table"), "pdf table missing");
assert(pdf.data.project.extraction.actions.find((action) => action.stepNumber === "3")?.page === 1, "pdf page missing");
assert(pdf.data.project.extraction.actions.find((action) => action.stepNumber === "7"), "unassigned table row missing");

const listA = await a.send("/api/projects");
const listB = await b.send("/api/projects");
assert(listA.data.projects.length === 2, `A projects ${listA.data.projects.length}`);
assert(listB.data.projects.length === 0, "B can see A projects");
const hidden = await b.send(`/api/projects/${docx.data.project.id}`);
assert(hidden.status === 404, `cross user status ${hidden.status}`);
const hiddenDelete = await b.send(`/api/projects/${docx.data.project.id}`, { method: "DELETE" });
assert(hiddenDelete.status === 404, "B deleted A project");

const analysis = await a.send(`/api/projects/${docx.data.project.id}/analyze`, { method: "POST", body: {} });
assert(analysis.status === 503, `analyze status ${analysis.status} ${analysis.data.error}`);
assert(/OPENAI_API_KEY/.test(analysis.data.error), analysis.data.error);
assert(/not be filled|not substituted|will not/i.test(analysis.data.error) || /sample diagram is not substituted/i.test(analysis.data.error), analysis.data.error);

const bad = new FormData();
bad.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");
const rejected = await a.send("/api/projects", { method: "POST", form: bad });
assert(rejected.status === 415, `txt status ${rejected.status} ${rejected.data.error}`);

const scanBytes = await (await fetch(base + "/api/samples/inbound-inspection-pdf/file", { headers: { cookie: "" } })).arrayBuffer().catch(() => null);
const image = await import("node:fs");
const scan = new FormData();
scan.append("file", new Blob([image.readFileSync("samples/image-only.pdf")], { type: "application/pdf" }), "image-only.pdf");
const ocr = await a.send("/api/projects", { method: "POST", form: scan });
assert(ocr.status === 422, `ocr status ${ocr.status} ${ocr.data.error}`);
assert(/OCR/i.test(ocr.data.error), ocr.data.error);

const big = new FormData();
big.append("file", new Blob([new Uint8Array(10 * 1024 * 1024 + 20)]), "big.pdf");
const oversized = await a.send("/api/projects", { method: "POST", form: big });
assert(oversized.status === 413, `size status ${oversized.status} ${oversized.data.error}`);

const after = await a.send("/api/projects");
assert(after.data.projects.length === 2, "failed uploads created projects");
console.log("API checks passed");
console.log("docx", docx.data.project.id);
console.log("pdf", pdf.data.project.id);
