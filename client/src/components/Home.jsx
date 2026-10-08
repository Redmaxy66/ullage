import { useEffect, useState } from "react";
import { api, formatBytes, formatWhen, versionLine } from "../api.js";

export function Home({ onOpen }) {
  const [projects, setProjects] = useState([]);
  const [samples, setSamples] = useState([]);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function refresh() {
    const [nextProjects, nextSamples, nextConfig] = await Promise.all([api.projects(), api.samples(), api.config()]);
    setProjects(nextProjects);
    setSamples(nextSamples);
    setConfig(nextConfig);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  async function openSample(sampleId) {
    setBusy(sampleId);
    setError("");
    try {
      const project = await api.useSample(sampleId);
      onOpen(project.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function remove(event, id) {
    event.stopPropagation();
    if (!window.confirm("Delete this project and its uploaded file? This cannot be undone.")) return;
    setError("");
    try {
      await api.removeProject(id);
      setProjects((current) => current.filter((project) => project.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="home">
      <div className="section-title">
        <h2>Projects</h2>
        <p className="muted">Upload limit 10 MB · Word (.docx) and text-based PDF</p>
      </div>
      {config && !config.configured && (
        <div className="banner">Diagram analysis needs an API key on the server. Add OPENAI_API_KEY to the .env file and restart. You can still upload a procedure and review the extracted text. A sample diagram will not be filled in.</div>
      )}
      {error && <div className="banner bad">{error}</div>}
      <div className="home-grid">
        <section className="card">
          <button className="button primary" style={{ margin: 16 }} type="button" onClick={() => onOpen("new")}>Upload an SOP</button>
          {projects.length === 0 && <div className="empty">No projects yet. Upload a procedure or open a sample SOP.</div>}
          {projects.map((project) => (
            <div className="project-row" key={project.id}>
              <button type="button" onClick={() => onOpen(project.id)} style={{ background: "none", border: 0, textAlign: "left", padding: 0 }}>
                <strong>{project.filename}</strong>
                <div className="muted">{versionLine(project.versionInfo)} · {formatWhen(project.updatedAt)} · {formatBytes(project.byteSize)}</div>
              </button>
              <span className={`chip ${project.reviewStatus || "draft"}`}>{project.reviewStatus === "reviewed" ? "Reviewed" : project.hasDiagram ? "Draft" : "Not mapped"}</span>
              <button className="button danger" type="button" onClick={(event) => remove(event, project.id)}>Delete</button>
            </div>
          ))}
        </section>
        <aside>
          <div className="section-title"><h2>Sample SOP</h2></div>
          <p className="muted" style={{ marginBottom: 10 }}>These files are labelled samples. Opening one runs the same upload and reading path as your own document.</p>
          {samples.map((sample) => (
            <article className="sample-card" key={sample.id}>
              <div className="sample-kicker">Sample SOP · {sample.format}</div>
              <strong>{sample.title}</strong>
              <p className="muted">{sample.summary}</p>
              <div className="button-row">
                <button className="button primary" type="button" disabled={busy === sample.id} onClick={() => openSample(sample.id)}>
                  {busy === sample.id ? "Reading…" : "Use this sample"}
                </button>
                <a className="button ghost" href={`/api/samples/${sample.id}/file`}>Download</a>
              </div>
            </article>
          ))}
        </aside>
      </div>
    </main>
  );
}
