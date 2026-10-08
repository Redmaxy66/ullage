export function ReviewStage({ project, config, busy, error, onAnalyze, onBuild }) {
  const extraction = project.extraction;
  const analysis = project.analysis;
  return (
    <div className="stack">
      {config && !config.configured && (
        <div className="banner">Diagram analysis needs an API key on the server. Add OPENAI_API_KEY to the .env file in the project folder and restart. The extracted text below stays available. This screen will not invent a diagram.</div>
      )}
      {error && <div className="banner bad">{error}</div>}
      <div className="button-row">
        <button className="button primary" type="button" disabled={busy} onClick={onAnalyze}>
          {busy ? "Reading roles, decisions, and handoffs…" : "Analyze procedure"}
        </button>
      </div>
      {analysis?.processes?.length > 1 && (
        <section className="stack">
          <h2>Choose a procedure</h2>
          <p className="muted">This document contains more than one procedure. Map one at a time.</p>
          {analysis.processes.map((process) => (
            <article className="process-card" key={process.id}>
              <strong>{process.name}</strong>
              <span className="muted">{process.nodes.length} steps from the document</span>
              {process.boundaries?.excerpt && <p className="quote">{process.boundaries.excerpt}</p>}
              <button className="button primary" type="button" disabled={busy} onClick={() => onBuild(process.id)}>
                {project.selectedProcessId === process.id && project.diagram ? "Mapped" : "Map this procedure"}
              </button>
            </article>
          ))}
        </section>
      )}
      {analysis?.processes?.length === 1 && project.diagram && (
        <div className="banner good">One procedure was mapped: {analysis.processes[0].name}. The diagram is a draft until you mark it reviewed.</div>
      )}
      {extraction?.notes?.length > 0 && (
        <section className="card pad">
          <h3>Unclear in the document</h3>
          {extraction.notes.map((note) => (
            <div key={note.id} className="coverage-item"><span className="chip warn">Needs review</span><div><div>{note.message}</div>{note.excerpt && <p className="quote">{note.excerpt}</p>}</div></div>
          ))}
        </section>
      )}
      {analysis?.rejected?.length > 0 && (
        <section className="card pad">
          <h3>Left out of the draft</h3>
          {analysis.rejected.map((item, index) => <p key={index}>{item.label}. {item.reason}</p>)}
        </section>
      )}
      <section className="doc">
        {(extraction?.blocks || []).map((block) => {
          if (block.type === "heading") return <div className="block" key={block.id}><h3>{block.text}</h3>{block.page ? <span className="muted">PDF page {block.page}</span> : null}</div>;
          if (block.type === "table") {
            return (
              <div className="block" key={block.id}>
                <table className="sop-table">
                  <tbody>
                    {block.rows.map((row, index) => (
                      <tr key={index}>{row.map((cell, cellIndex) => index === 0 ? <th key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          return (
            <div className={`block ${block.type === "step" ? "step" : ""}`} key={block.id}>
              <div>{block.text}</div>
              <div className="muted">{[block.section, block.stepNumber ? `Step ${block.stepNumber}` : null, block.page ? `PDF page ${block.page}` : null].filter(Boolean).join(" · ")}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
