async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "The request failed.");
    error.status = response.status;
    error.needsConfirm = Boolean(data.needsConfirm);
    throw error;
  }
  return data;
}

async function send(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...options,
  });
  return parse(response);
}

export const api = {
  me: () => send("/api/me").then((data) => data.user).catch((error) => {
    if (error.status === 401) return null;
    throw error;
  }),
  config: () => send("/api/config"),
  register: (body) => send("/api/register", { method: "POST", body: JSON.stringify(body) }).then((data) => data.user),
  login: (body) => send("/api/login", { method: "POST", body: JSON.stringify(body) }).then((data) => data.user),
  logout: () => send("/api/logout", { method: "POST" }),
  samples: () => send("/api/samples").then((data) => data.samples),
  projects: () => send("/api/projects").then((data) => data.projects),
  project: (id) => send(`/api/projects/${id}`).then((data) => data.project),
  removeProject: (id) => send(`/api/projects/${id}`, { method: "DELETE" }),
  useSample: (sampleId) => send("/api/projects/sample", { method: "POST", body: JSON.stringify({ sampleId }) }).then((data) => data.project),
  analyze: (id, confirmOverwrite = false) => send(`/api/projects/${id}/analyze`, {
    method: "POST",
    body: JSON.stringify({ confirmOverwrite }),
  }).then((data) => data.project),
  build: (id, processId, confirmOverwrite = false) => send(`/api/projects/${id}/diagram/build`, {
    method: "POST",
    body: JSON.stringify({ processId, confirmOverwrite }),
  }).then((data) => data.project),
  saveDiagram: (id, diagram) => send(`/api/projects/${id}/diagram`, {
    method: "PUT",
    body: JSON.stringify({ diagram }),
  }).then((data) => data.project),
  review: (id, status) => send(`/api/projects/${id}/review`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  }).then((data) => data.project),
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/projects");
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || "{}"); } catch { data = {}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.project);
        else reject(Object.assign(new Error(data.error || "Upload failed."), { status: xhr.status }));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
      const body = new FormData();
      body.append("file", file);
      xhr.send(body);
    });
  },
};

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWhen(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function versionLine(info) {
  if (!info || (!info.version && !info.effectiveDate && !info.documentNumber)) {
    return "Version not stated in the document";
  }
  const parts = [];
  if (info.documentNumber) parts.push(info.documentNumber);
  parts.push(info.version ? `Version ${info.version}` : "Version not stated");
  if (info.effectiveDate) parts.push(`Effective ${info.effectiveDate}`);
  return parts.join(" · ");
}
