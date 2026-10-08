import { addExtractedAction, coverage, ensureUnassigned, UNASSIGNED_NAME, withEdit } from "@shared/diagram.js";
import { versionLine } from "../api.js";

function statusChip(status) {
  if (status === "unresolved") return <span className="chip warn">Needs review</span>;
  if (status === "inferred") return <span className="chip inferred">Inferred</span>;
  return <span className="chip ok">Stated in the SOP</span>;
}

export function EvidencePanel({ project, stage, selection, onSelect, onChange, onOpenDiagram }) {
  const diagram = project.diagram;
  const report = diagram ? coverage(project.extraction, diagram) : [];
  const omitted = report.filter((item) => !item.represented);
  const node = selection?.type === "node" ? diagram?.nodes.find((item) => item.id === selection.id) : null;
  const edge = selection?.type === "edge" ? diagram?.edges.find((item) => item.id === selection.id) : null;
  const lane = selection?.type === "lane" ? diagram?.lanes.find((item) => item.id === selection.id) : null;

  function edit(next) {
    onChange(withEdit(next));
  }

  return (
    <aside className="panel">
      <h2>Source and review</h2>
      <p><strong>{project.filename}</strong></p>
      <p className="muted">{versionLine(project.versionInfo)}</p>
      <p style={{ marginTop: 8 }}>
        {diagram
          ? <span className={`chip ${diagram.reviewStatus}`}>{diagram.reviewStatus === "reviewed" ? "Reviewed" : "Draft"}</span>
          : <span className="chip">No diagram yet</span>}
      </p>
      {project.extraction?.kind === "pdf" && <p className="muted" style={{ marginTop: 8 }}>{project.extraction.pages?.length || 0} PDF pages read as text.</p>}

      {node && (
        <section>
          <h3>{node.type === "decision" ? "Decision" : node.type === "start" ? "Start" : node.type === "end" ? "End" : "Action"}</h3>
          <div className="button-row">{statusChip(node.status)}{node.userAdded && <span className="chip">Added in review</span>}</div>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Label</span>
            <textarea value={node.label} onChange={(event) => edit({
              ...diagram,
              nodes: diagram.nodes.map((item) => item.id === node.id ? { ...item, label: event.target.value } : item),
            })} />
          </label>
          {node.type !== "start" && node.type !== "end" && (
            <label className="field">
              <span>Lane</span>
              <select value={node.laneId} onChange={(event) => {
                const next = ensureUnassigned(diagram);
                const laneId = event.target.value === "unassigned" ? "lane-unassigned" : event.target.value;
                edit({ ...next, nodes: next.nodes.map((item) => item.id === node.id ? { ...item, laneId, status: laneId === "lane-unassigned" ? "unresolved" : item.status } : item) });
              }}>
                {diagram.lanes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                {!diagram.lanes.some((item) => item.unassigned) && <option value="unassigned">{UNASSIGNED_NAME}</option>}
              </select>
            </label>
          )}
          <SourceBlock node={node} />
          {!node.structural && <button className="button danger" type="button" onClick={() => {
            edit({ ...diagram, nodes: diagram.nodes.filter((item) => item.id !== node.id), edges: diagram.edges.filter((item) => item.from !== node.id && item.to !== node.id) });
            onSelect(null);
          }}>Remove this step</button>}
        </section>
      )}

      {edge && (
        <section>
          <h3>Arrow</h3>
          <label className="field">
            <span>Branch label</span>
            <input value={edge.label || ""} onChange={(event) => edit({
              ...diagram,
              edges: diagram.edges.map((item) => item.id === edge.id ? { ...item, label: event.target.value, stated: false, userAdded: true } : item),
            })} />
          </label>
          <p className="muted">{edge.kind === "rework" ? "Rework loop" : edge.kind === "exception" ? "Exception path" : edge.kind === "decision" ? "Decision branch" : edge.kind === "handoff" ? "Handoff" : "Sequence"}{edge.stated ? " · label found in the SOP" : " · not quoted as a branch label"}</p>
          {edge.source?.excerpt && <p className="quote">{edge.source.excerpt}</p>}
          {!edge.source?.excerpt && <p className="muted">No source excerpt is on file for this arrow.</p>}
          {!edge.structural && <button className="button danger" type="button" onClick={() => { edit({ ...diagram, edges: diagram.edges.filter((item) => item.id !== edge.id) }); onSelect(null); }}>Remove arrow</button>}
        </section>
      )}

      {lane && (
        <section>
          <h3>Lane</h3>
          <label className="field">
            <span>Role name</span>
            <input value={lane.name} disabled={lane.unassigned} onChange={(event) => edit({
              ...diagram,
              lanes: diagram.lanes.map((item) => item.id === lane.id ? { ...item, name: event.target.value, stated: false, renamed: true } : item),
            })} />
          </label>
          {lane.renamed && <p className="muted">This lane name was edited during review.</p>}
          {lane.stated && !lane.renamed && <p className="muted">This role name appears in the SOP.</p>}
          {lane.unassigned && <p className="muted">Steps stay here until a responsible role is clear.</p>}
        </section>
      )}

      {diagram && (stage === "diagram" || stage === "export" || stage === "review") && (
        <section>
          <h3>Steps on the diagram</h3>
          <p className="muted">{report.filter((item) => item.represented).length} of {report.length} extracted actions are drawn. {omitted.length} omitted.</p>
          {omitted.map((item) => (
            <div className="coverage-item" key={item.id}>
              <span className="chip warn">Omitted</span>
              <div>
                <div>{item.stepNumber ? `Step ${item.stepNumber}. ` : ""}{item.text}</div>
                <div className="muted">{[item.section, item.page ? `PDF page ${item.page}` : null].filter(Boolean).join(" · ")}</div>
                <button className="button ghost" type="button" onClick={() => {
                  const action = project.extraction.actions.find((entry) => entry.id === item.id);
                  const result = addExtractedAction(diagram, action);
                  onChange(result.diagram);
                  onSelect({ type: "node", id: result.nodeId });
                  onOpenDiagram();
                }}>Add to diagram</button>
              </div>
            </div>
          ))}
          {report.filter((item) => item.represented).map((item) => (
            <div className="coverage-item" key={item.id}><span className="chip ok">On diagram</span><div>{item.stepNumber ? `Step ${item.stepNumber}. ` : ""}{item.text}</div></div>
          ))}
        </section>
      )}

      {project.extraction?.boundaries?.length > 0 && (
        <section>
          <h3>Boundaries stated in the SOP</h3>
          {project.extraction.boundaries.map((item) => <p className="quote" key={item.excerpt}>{item.excerpt}</p>)}
        </section>
      )}
    </aside>
  );
}

function SourceBlock({ node }) {
  if (node.structural && !node.source?.excerpt) {
    return <p className="muted">Diagram marker. The SOP does not state a separate {node.type} step, so no source quote is attached.</p>;
  }
  if (!node.source?.excerpt && node.userAdded) {
    return <p className="muted">Added during review. This box is not quoted from the SOP.</p>;
  }
  if (!node.source?.excerpt) return <p className="muted">No source excerpt is on file for this item.</p>;
  const bits = [node.source.section, node.source.stepNumber ? `Step ${node.source.stepNumber}` : null, node.source.page ? `PDF page ${node.source.page}` : null].filter(Boolean);
  return (
    <div>
      {bits.length > 0 && <p className="muted">{bits.join(" · ")}</p>}
      <p className="quote">{node.source.excerpt}</p>
    </div>
  );
}
