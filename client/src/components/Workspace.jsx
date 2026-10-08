import { useEffect, useState } from "react";
import { api, versionLine } from "../api.js";
import { UploadStage } from "./UploadStage.jsx";
import { ReviewStage } from "./ReviewStage.jsx";
import { DiagramStage } from "./DiagramStage.jsx";
import { ExportStage } from "./ExportStage.jsx";
import { EvidencePanel } from "./EvidencePanel.jsx";

const STAGES = [
  ["upload", "Upload"],
  ["review", "Review"],
  ["diagram", "Diagram"],
  ["export", "Export"],
];

export function Workspace({ projectId, onHome }) {
  const [project, setProject] = useState(null);
  const [stage, setStage] = useState(projectId === "new" ? "upload" : "review");
  const [selection, setSelection] = useState(null);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    const onLeave = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    if (projectId === "new") return;
    setError("");
    api.project(projectId).then((next) => {
      setProject(next);
      setStage(next.diagram ? "diagram" : "review");
    }).catch((err) => setError(err.message));
    api.config().then(setConfig).catch(() => {});
  }, [projectId]);

  function changeDiagram(diagram) {
    setProject((current) => ({ ...current, diagram }));
    setDirty(true);
  }

  async function runConfirmed(action) {
    setBusy(true);
    setError("");
    try {
      const next = await action(false);
      setProject(next);
      setDirty(false);
      setSelection(null);
      if (next.diagram) setStage("diagram");
      else setStage("review");
    } catch (err) {
      if (err.needsConfirm) {
        setConfirm(() => async () => {
          setConfirm(null);
          setBusy(true);
          try {
            const next = await action(true);
            setProject(next);
            setDirty(false);
            setSelection(null);
            setStage(next.diagram ? "diagram" : "review");
          } catch (inner) {
            setError(inner.message);
          } finally {
            setBusy(false);
          }
        });
      } else setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = await api.saveDiagram(project.id, project.diagram);
      setProject(next);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markReviewed() {
    const unclear = (project.diagram?.nodes || []).filter((node) => node.status === "unresolved").length;
    if (unclear && !window.confirm(`${unclear} item${unclear === 1 ? "" : "s"} still need review. Mark the diagram reviewed anyway?`)) return;
    if (dirty) await save();
    setBusy(true);
    try {
      const next = await api.review(project.id, "reviewed");
      setProject(next);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (projectId !== "new" && !project) {
    return <div className="home">{error ? <div className="banner bad">{error}</div> : <p>Loading the procedure…</p>}</div>;
  }

  const stagesEnabled = {
    upload: true,
    review: Boolean(project),
    diagram: Boolean(project?.diagram) || Boolean(project?.analysis),
    export: Boolean(project?.diagram),
  };

  return (
    <div className="workspace">
      <div className="file-line">
        <div>
          <h1>{project?.filename || "New procedure"}</h1>
          <p className="muted">{project ? versionLine(project.versionInfo) : "Upload a Word or PDF file. Limit 10 MB."}</p>
        </div>
        <div className="button-row">
          {project?.diagram && <span className={`chip ${project.diagram.reviewStatus}`}>{project.diagram.reviewStatus === "reviewed" ? "Reviewed" : "Draft"}</span>}
          {dirty && <span className="muted">Unsaved edits</span>}
          {project?.diagram && <button className="button ghost" type="button" disabled={!dirty || busy} onClick={save}>Save</button>}
          {project?.diagram && <button className="button primary" type="button" disabled={busy} onClick={markReviewed}>Mark reviewed</button>}
          <button className="button ghost" type="button" onClick={onHome}>All projects</button>
        </div>
      </div>
      <nav className="stage-bar" aria-label="Stages">
        {STAGES.map(([id, label]) => (
          <button key={id} className={`stage-tab ${stage === id ? "active" : ""}`} type="button" disabled={!stagesEnabled[id]} onClick={() => setStage(id)}>{label}</button>
        ))}
      </nav>
      <div className="workspace-body">
        <main className="stage-main">
          {stage === "upload" && <UploadStage onUploaded={(next) => { setProject(next); setStage("review"); setDirty(false); }} />}
          {stage === "review" && project && (
            <ReviewStage
              project={project}
              config={config}
              busy={busy}
              error={error}
              onAnalyze={() => runConfirmed((confirm) => api.analyze(project.id, confirm))}
              onBuild={(processId) => runConfirmed((confirm) => api.build(project.id, processId, confirm))}
            />
          )}
          {stage === "diagram" && project?.diagram && (
            <DiagramStage diagram={project.diagram} selection={selection} onSelect={setSelection} onChange={changeDiagram} />
          )}
          {stage === "diagram" && project && !project.diagram && (
            <div className="banner">Choose a procedure on the Review stage before the diagram can be drawn.</div>
          )}
          {stage === "export" && project?.diagram && <ExportStage project={project} />}
          {error && stage !== "review" && stage !== "upload" && <div className="banner bad" style={{ marginTop: 12 }}>{error}</div>}
        </main>
        {project && (
          <EvidencePanel
            project={project}
            stage={stage}
            selection={selection}
            onSelect={setSelection}
            onChange={changeDiagram}
            onOpenDiagram={() => setStage("diagram")}
          />
        )}
      </div>
      {confirm && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-label="Replace diagram">
          <div className="modal">
            <h2>Replace the current diagram?</h2>
            <p>Manual edits will be overwritten by a new draft. Saved copies are not kept.</p>
            <div className="button-row">
              <button className="button primary" type="button" onClick={confirm}>Replace diagram</button>
              <button className="button ghost" type="button" onClick={() => setConfirm(null)}>Keep my edits</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
