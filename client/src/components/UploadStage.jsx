import { useState } from "react";
import { api, formatBytes } from "../api.js";

export function UploadStage({ onUploaded }) {
  const [hot, setHot] = useState(false);
  const [progress, setProgress] = useState(null);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");

  async function take(file) {
    if (!file) return;
    setError("");
    setProgress(0);
    setPhase("Uploading");
    try {
      const project = await api.upload(file, (value) => {
        setProgress(value);
        if (value >= 1) setPhase("Reading the document");
      });
      setPhase("");
      onUploaded(project);
    } catch (err) {
      setPhase("");
      setProgress(null);
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      <label
        className={`drop ${hot ? "hot" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(event) => { event.preventDefault(); setHot(false); take(event.dataTransfer.files?.[0]); }}
      >
        <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => take(event.target.files?.[0])} />
        <strong>Drop a Word or PDF procedure here</strong>
        <span className="muted">or click to choose a file. Limit {formatBytes(10 * 1024 * 1024)}. Scanned PDFs are not read in this version.</span>
        {progress != null && (
          <div className="progress" aria-label={phase}><span style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></div>
        )}
        {phase && <span>{phase}…</span>}
      </label>
      {error && <div className="banner bad">{error}</div>}
    </div>
  );
}
