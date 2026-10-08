import { useState } from "react";
import { diagramSvg } from "@shared/diagram.js";
import { exportPdf, exportPng, exportSvg } from "../exportFile.js";

export function ExportStage({ project }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const preview = diagramSvg(project.diagram, { markerId: "preview-arrow" });

  async function run(kind) {
    setError("");
    setBusy(kind);
    try {
      if (kind === "svg") exportSvg(project.diagram, project.filename);
      if (kind === "png") await exportPng(project.diagram, project.filename);
      if (kind === "pdf") await exportPdf(project.diagram, project.filename);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="stack">
      <p className="muted">Exports include every lane and the labels on the diagram. {project.diagram.reviewStatus === "reviewed" ? "This copy is marked reviewed." : "This copy is marked draft."}</p>
      <div className="button-row">
        <button className="button primary" type="button" disabled={busy} onClick={() => run("svg")}>{busy === "svg" ? "Preparing…" : "Download SVG"}</button>
        <button className="button ghost" type="button" disabled={busy} onClick={() => run("png")}>{busy === "png" ? "Preparing…" : "Download PNG"}</button>
        <button className="button ghost" type="button" disabled={busy} onClick={() => run("pdf")}>{busy === "pdf" ? "Preparing…" : "Download PDF"}</button>
      </div>
      {error && <div className="banner bad">{error}</div>}
      <div className="export-preview" dangerouslySetInnerHTML={{ __html: preview.svg }} />
    </div>
  );
}
