import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addNode, diagramSvg, LANE_LABEL_W, moveLane, uid, withEdit } from "@shared/diagram.js";

export function DiagramStage({ diagram, selection, onSelect, onChange }) {
  const viewportRef = useRef(null);
  const [view, setView] = useState({ x: 24, y: 24, scale: 1 });
  const [mode, setMode] = useState("select");
  const [connectFrom, setConnectFrom] = useState(null);
  const viewRef = useRef(view);
  const dragRef = useRef(null);
  viewRef.current = view;
  const rendered = useMemo(() => diagramSvg(diagram, { markerId: "editor-arrow" }), [diagram]);
  const geom = rendered.geom;

  function fit() {
    const box = viewportRef.current;
    if (!box) return;
    const scale = Math.min((box.clientWidth - 40) / geom.width, (box.clientHeight - 40) / geom.height, 1.15);
    const safe = Math.max(0.3, scale);
    setView({
      scale: safe,
      x: (box.clientWidth - geom.width * safe) / 2,
      y: (box.clientHeight - geom.height * safe) / 2,
    });
  }

  useLayoutEffect(() => { fit(); }, [diagram.id]);

  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = box.getBoundingClientRect();
      const current = viewRef.current;
      const next = Math.min(2.2, Math.max(0.3, current.scale * (event.deltaY < 0 ? 1.08 : 0.92)));
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const ratio = next / current.scale;
      setView({ scale: next, x: px - (px - current.x) * ratio, y: py - (py - current.y) * ratio });
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key === "Escape") { setMode("select"); setConnectFrom(null); }
      if ((event.key === "Delete" || event.key === "Backspace") && selection?.type === "node") {
        const node = diagram.nodes.find((item) => item.id === selection.id);
        if (!node || node.structural) return;
        onChange(withEdit({
          ...diagram,
          nodes: diagram.nodes.filter((item) => item.id !== node.id),
          edges: diagram.edges.filter((edge) => edge.from !== node.id && edge.to !== node.id),
        }));
        onSelect(null);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selection?.type === "edge") {
        onChange(withEdit({ ...diagram, edges: diagram.edges.filter((edge) => edge.id !== selection.id) }));
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diagram, selection, onChange, onSelect]);

  function toPoint(event) {
    const rect = viewportRef.current.getBoundingClientRect();
    const current = viewRef.current;
    return {
      x: (event.clientX - rect.left - current.x) / current.scale,
      y: (event.clientY - rect.top - current.y) / current.scale,
    };
  }

  function laneAt(y) {
    return geom.lanes.find((lane) => y >= lane.y && y < lane.y + lane.h) || geom.lanes.at(-1);
  }

  function onPointerMove(event) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      setView({ ...viewRef.current, x: drag.x + event.clientX - drag.px, y: drag.y + event.clientY - drag.py });
      return;
    }
    const point = toPoint(event);
    const lane = laneAt(point.y);
    onChange(withEdit({
      ...diagram,
      nodes: diagram.nodes.map((node) => node.id === drag.id ? {
        ...node,
        x: Math.max(LANE_LABEL_W + 16, point.x - drag.dx),
        laneId: lane?.id || node.laneId,
      } : node),
    }));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function connect(nodeId) {
    if (!connectFrom) { setConnectFrom(nodeId); return; }
    if (connectFrom === nodeId) { setConnectFrom(null); return; }
    const exists = diagram.edges.some((edge) => edge.from === connectFrom && edge.to === nodeId);
    const source = diagram.nodes.find((node) => node.id === connectFrom);
    if (!exists) {
      const edge = {
        id: uid(),
        from: connectFrom,
        to: nodeId,
        label: "",
        kind: source?.type === "decision" ? "decision" : "sequence",
        stated: false,
        userAdded: true,
        source: null,
      };
      onChange(withEdit({ ...diagram, edges: [...diagram.edges, edge] }));
      onSelect({ type: "edge", id: edge.id });
    }
    setConnectFrom(null);
    setMode("select");
  }

  function add(type) {
    const laneId = selection?.type === "node"
      ? diagram.nodes.find((node) => node.id === selection.id)?.laneId
      : selection?.type === "lane" ? selection.id : diagram.lanes.find((lane) => !lane.unassigned)?.id;
    const result = addNode(diagram, { type, laneId });
    onChange(result.diagram);
    onSelect({ type: "node", id: result.nodeId });
  }

  return (
    <div>
      <div className="toolbar">
        <button className="button ghost" type="button" onClick={() => setView((v) => ({ ...v, scale: Math.min(2.2, v.scale * 1.1) }))}>Zoom in</button>
        <button className="button ghost" type="button" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.3, v.scale / 1.1) }))}>Zoom out</button>
        <button className="button ghost" type="button" onClick={fit}>Fit</button>
        <span className="muted">{Math.round(view.scale * 100)}%</span>
        <button className="button ghost" type="button" onClick={() => {
          if (diagram.manuallyEdited && !window.confirm("Automatic layout will move the boxes. Labels, lanes, and arrows stay as they are.")) return;
          onChange(withEdit({ ...diagram, nodes: diagram.nodes.map((node) => ({ ...node, x: undefined })) }));
        }}>Auto layout</button>
        <button className="button ghost" type="button" onClick={() => add("action")}>Add action</button>
        <button className="button ghost" type="button" onClick={() => add("decision")}>Add decision</button>
        <button className={`button ${mode === "connect" ? "primary" : "ghost"}`} type="button" onClick={() => { setMode(mode === "connect" ? "select" : "connect"); setConnectFrom(null); }}>Add arrow</button>
        <button className="button ghost" type="button" onClick={() => selection?.type === "lane" && onChange(moveLane(diagram, selection.id, -1))}>Lane up</button>
        <button className="button ghost" type="button" onClick={() => selection?.type === "lane" && onChange(moveLane(diagram, selection.id, 1))}>Lane down</button>
      </div>
      {mode === "connect" && <div className="banner">{connectFrom ? "Choose the step this arrow goes to." : "Choose the step this arrow starts from."}</div>}
      <div
        className={`canvas-viewport ${mode === "connect" ? "connecting" : ""}`}
        ref={viewportRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="diagram-sheet" style={{ width: geom.width, height: geom.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}>
          <div dangerouslySetInnerHTML={{ __html: rendered.svg }} />
          <svg className="hit-layer" width={geom.width} height={geom.height}>
            <rect width={geom.width} height={geom.height} fill="transparent" onPointerDown={(event) => {
              if (mode === "connect") return;
              onSelect(null);
              dragRef.current = { kind: "pan", px: event.clientX, py: event.clientY, x: viewRef.current.x, y: viewRef.current.y };
            }} />
            {geom.lanes.map((lane) => (
              <rect key={lane.id} x="0" y={lane.y} width={LANE_LABEL_W} height={lane.h} fill="transparent" stroke={selection?.type === "lane" && selection.id === lane.id ? "#0f6e5b" : "transparent"} strokeWidth="3"
                onPointerDown={(event) => { event.stopPropagation(); onSelect({ type: "lane", id: lane.id }); }} />
            ))}
            {geom.edges.map((edge) => (
              <path key={edge.id} d={edge.d} fill="none" stroke="transparent" strokeWidth="14"
                onPointerDown={(event) => { event.stopPropagation(); onSelect({ type: "edge", id: edge.id }); }} />
            ))}
            {geom.nodes.map((node) => (
              <rect key={node.id} x={node.x} y={node.y} width={node.w} height={node.h} rx="8" fill="transparent" stroke={selection?.type === "node" && selection.id === node.id ? "#0f6e5b" : "transparent"} strokeWidth="3"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (mode === "connect") { connect(node.id); return; }
                  onSelect({ type: "node", id: node.id });
                  const point = toPoint(event);
                  dragRef.current = { kind: "node", id: node.id, dx: point.x - node.x };
                }} />
            ))}
          </svg>
        </div>
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        <span>Drag the background to pan. Drag a box to move it, including into another lane.</span>
        <span>Dashed outline means the wording was inferred. Amber outline means the role or branch still needs review.</span>
      </div>
    </div>
  );
}
