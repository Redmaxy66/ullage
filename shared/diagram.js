export const LANE_LABEL_W = 196;
export const TITLE_H = 56;
export const RAIL_H = 72;
export const COL_W = 248;
export const UNASSIGNED_NAME = "Unassigned — needs review";

const ACTION_W = 208;
const ACTION_H = 78;
const DECISION_W = 156;
const DECISION_H = 118;
const TERM_W = 132;
const TERM_H = 46;

export function uid() {
  return crypto.randomUUID();
}

export function nodeSize(node) {
  if (node.type === "decision") return { w: DECISION_W, h: DECISION_H };
  if (node.type === "start" || node.type === "end") return { w: TERM_W, h: TERM_H };
  return { w: ACTION_W, h: ACTION_H };
}

export function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[ch]
  ));
}

export function wrapLabel(text, maxChars, maxLines = 4) {
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["Untitled"];
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    if (!last.endsWith("…")) {
      last = last.length > 1 ? `${last.slice(0, Math.max(1, maxChars - 1))}…` : "…";
    }
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines;
}

function forwardEdges(edges) {
  return edges.filter((edge) => edge.kind !== "rework");
}

function columnMap(nodes, edges) {
  const ids = nodes.map((node) => node.id);
  const col = new Map(ids.map((id) => [id, 0]));
  const forward = forwardEdges(edges).filter((edge) => col.has(edge.from) && col.has(edge.to));
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const edge of forward) {
      const next = col.get(edge.from) + 1;
      if (next > col.get(edge.to)) {
        col.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return col;
}

export function autoLayout(diagram) {
  const nodes = diagram.nodes.map((node) => ({ ...node }));
  const col = columnMap(nodes, diagram.edges);
  const used = new Set();
  const ordered = [...nodes].sort((a, b) => (col.get(a.id) - col.get(b.id)) || String(a.stepNumber || "").localeCompare(String(b.stepNumber || ""), undefined, { numeric: true }));
  for (const node of ordered) {
    let column = col.get(node.id) ?? 0;
    while (used.has(`${node.laneId}:${column}`)) column += 1;
    used.add(`${node.laneId}:${column}`);
    const size = nodeSize(node);
    node.x = LANE_LABEL_W + 28 + column * COL_W + (COL_W - size.w) / 2;
  }
  return { ...diagram, nodes };
}

function rowsFor(members) {
  const placed = [];
  const rowOf = new Map();
  const sorted = [...members].sort((a, b) => a.x - b.x);
  for (const node of sorted) {
    const size = nodeSize(node);
    let row = 0;
    while (placed.some((other) => other.row === row && node.x < other.right && node.x + size.w > other.left)) {
      row += 1;
    }
    placed.push({ row, left: node.x, right: node.x + size.w });
    rowOf.set(node.id, row);
  }
  const rowCount = Math.max(1, ...placed.map((item) => item.row + 1));
  return { rowOf, rowCount };
}

function routeEdge(edge, from, to, railY, bump) {
  const backward = edge.kind === "rework" || to.x + to.w < from.x + 8;
  if (backward) {
    const x1 = from.x + from.w / 2;
    const x2 = to.x + to.w / 2;
    const rail = railY + bump;
    return {
      d: `M ${x1} ${from.y + from.h} L ${x1} ${rail} L ${x2} ${rail} L ${x2} ${to.y + to.h}`,
      lx: (x1 + x2) / 2,
      ly: rail - 10,
    };
  }
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const mid = (x1 + x2) / 2 + bump;
  const d = Math.abs(y1 - y2) < 8
    ? `M ${x1} ${y1} L ${x2} ${y2}`
    : `M ${x1} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${x2} ${y2}`;
  return { d, lx: mid, ly: Math.min(y1, y2) + Math.abs(y2 - y1) / 2 - 10 };
}

export function geometry(diagram) {
  const laidOut = diagram.nodes.every((node) => Number.isFinite(node.x)) ? diagram : autoLayout(diagram);
  const lanes = [...laidOut.lanes].sort((a, b) => a.order - b.order);
  let cursor = TITLE_H;
  const laneBoxes = [];
  const nodeBoxes = [];

  for (const lane of lanes) {
    const members = laidOut.nodes.filter((node) => node.laneId === lane.id);
    const { rowOf, rowCount } = rowsFor(members);
    const stackH = rowCount * ACTION_H + Math.max(0, rowCount - 1) * 14;
    const height = Math.max(148, stackH + 36);
    laneBoxes.push({ ...lane, y: cursor, h: height });
    members.forEach((node) => {
      const size = nodeSize(node);
      const row = rowOf.get(node.id) ?? 0;
      const block = rowCount * size.h + Math.max(0, rowCount - 1) * 14;
      const y = cursor + (height - block) / 2 + row * (size.h + 14);
      nodeBoxes.push({ ...node, ...size, y });
    });
    cursor += height;
  }

  const contentBottom = cursor;
  const railY = contentBottom + 28;
  const height = contentBottom + RAIL_H;
  const byId = new Map(nodeBoxes.map((node) => [node.id, node]));
  const bumps = new Map();
  const edgeBoxes = [];
  laidOut.edges.forEach((edge, index) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    const key = [edge.from, edge.to].sort().join(":");
    const bump = (bumps.get(key) ?? 0) * 12;
    bumps.set(key, (bumps.get(key) ?? 0) + 1);
    const routed = routeEdge(edge, from, to, railY, bump + (index % 2) * 4);
    edgeBoxes.push({ ...edge, ...routed });
  });

  const right = nodeBoxes.reduce((max, node) => Math.max(max, node.x + node.w), 0);
  const width = Math.max(920, right + 48, LANE_LABEL_W + 320);

  return {
    width,
    height,
    title: laidOut.processName || "Procedure",
    reviewStatus: laidOut.reviewStatus || "draft",
    lanes: laneBoxes,
    nodes: nodeBoxes,
    edges: edgeBoxes,
  };
}

function textBlock(lines, x, y, size, fill, weight = 600) {
  const lineHeight = size + 3;
  const start = y - ((lines.length - 1) * lineHeight) / 2;
  return lines.map((line, index) => (
    `<text x="${x}" y="${start + index * lineHeight}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
  )).join("");
}

export function diagramSvg(diagram, { markerId = "arrow" } = {}) {
  const geom = geometry(diagram);
  const parts = [];
  parts.push(`<rect width="${geom.width}" height="${geom.height}" fill="#ffffff"/>`);
  parts.push(`<rect x="0" y="0" width="${geom.width}" height="${TITLE_H}" fill="#1c2430"/>`);
  parts.push(`<text x="20" y="34" font-family="Georgia, serif" font-size="18" fill="#ffffff">${escapeXml(geom.title)}</text>`);
  const status = geom.reviewStatus === "reviewed" ? "Reviewed" : "DRAFT — not reviewed";
  parts.push(`<text x="${geom.width - 20}" y="34" text-anchor="end" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700" fill="${geom.reviewStatus === "reviewed" ? "#b7e4d6" : "#f2c7a5"}">${escapeXml(status)}</text>`);

  for (const lane of geom.lanes) {
    const fill = lane.unassigned ? "#f8efe4" : (lane.order % 2 === 0 ? "#f7f4ee" : "#eef4f2");
    parts.push(`<rect x="0" y="${lane.y}" width="${geom.width}" height="${lane.h}" fill="${fill}"/>`);
    parts.push(`<rect x="0" y="${lane.y}" width="${LANE_LABEL_W}" height="${lane.h}" fill="${lane.unassigned ? "#ead9c4" : "#243140"}"/>`);
    const nameLines = wrapLabel(lane.name, 18, 3);
    parts.push(textBlock(nameLines, LANE_LABEL_W / 2, lane.y + lane.h / 2, 13, lane.unassigned ? "#6d3b16" : "#ffffff", 650));
    parts.push(`<line x1="0" y1="${lane.y + lane.h}" x2="${geom.width}" y2="${lane.y + lane.h}" stroke="#e3dacb" stroke-width="1"/>`);
  }

  parts.push(`<defs><marker id="${markerId}" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="9" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 4 L 0 8 z" fill="#1c2430"/></marker></defs>`);

  for (const edge of geom.edges) {
    const color = edge.kind === "rework" ? "#9a4e24" : "#1c2430";
    const dash = edge.kind === "rework" ? ` stroke-dasharray="6 4"` : "";
    parts.push(`<path d="${edge.d}" fill="none" stroke="${color}" stroke-width="1.7"${dash} marker-end="url(#${markerId})"/>`);
    if (edge.label) {
      const label = String(edge.label);
      const width = Math.min(220, Math.max(36, label.length * 6.4 + 14));
      const shown = label.length > 34 ? `${label.slice(0, 32)}…` : label;
      parts.push(`<rect x="${edge.lx - width / 2}" y="${edge.ly - 9}" width="${width}" height="18" rx="4" fill="#ffffff" stroke="#e3dacb"/>`);
      parts.push(`<text x="${edge.lx}" y="${edge.ly + 4}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="11" font-weight="650" fill="${color}">${escapeXml(shown)}</text>`);
    }
  }

  for (const node of geom.nodes) {
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    const inferred = node.status === "inferred";
    const unresolved = node.status === "unresolved" || node.laneId === "lane-unassigned";
    const stroke = unresolved ? "#9a4e24" : "#1c2430";
    const dash = inferred ? ` stroke-dasharray="5 3"` : "";
    if (node.type === "decision") {
      const points = `${cx},${node.y + 2} ${node.x + node.w - 2},${cy} ${cx},${node.y + node.h - 2} ${node.x + 2},${cy}`;
      parts.push(`<polygon points="${points}" fill="#ffffff" stroke="${stroke}" stroke-width="1.7"${dash}/>`);
      parts.push(textBlock(wrapLabel(node.label, 16, 3), cx, cy, 12, "#1c2430"));
    } else if (node.type === "start" || node.type === "end") {
      const fill = node.type === "start" ? "#0f6e5b" : "#1c2430";
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${node.h / 2}" fill="${fill}"/>`);
      parts.push(textBlock(wrapLabel(node.label, 16, 2), cx, cy + 1, 13, "#ffffff"));
    } else {
      parts.push(`<rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="1.7"${dash}/>`);
      parts.push(textBlock(wrapLabel(node.label, 26, 4), cx, cy, 12.5, "#1c2430", 600));
    }
  }

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${geom.width}" height="${geom.height}" viewBox="0 0 ${geom.width} ${geom.height}">${parts.join("")}</svg>`,
    geom,
  };
}

function norm(value) {
  return String(value ?? "").toLowerCase().replace(/['']/g, "'").replace(/\s+/g, " ").trim();
}

export function actionRepresented(action, nodes) {
  return nodes.some((node) => {
    if (node.extractedActionId && node.extractedActionId === action.id) return true;
    if (action.stepNumber && node.stepNumber && String(action.stepNumber) === String(node.stepNumber)) return true;
    const excerpt = norm(node.source?.excerpt || node.excerpt);
    const text = norm(action.text);
    if (excerpt && text && (text.includes(excerpt) || excerpt.includes(text))) return true;
    return false;
  });
}

export function coverage(extraction, diagram) {
  const actions = extraction?.actions || [];
  const nodes = diagram?.nodes || [];
  return actions.map((action) => ({
    id: action.id,
    stepNumber: action.stepNumber || null,
    text: action.text,
    section: action.section || null,
    page: action.page ?? null,
    represented: actionRepresented(action, nodes),
  }));
}

export function ensureUnassigned(diagram) {
  if (diagram.lanes.some((lane) => lane.unassigned)) return diagram;
  return {
    ...diagram,
    lanes: [...diagram.lanes, {
      id: "lane-unassigned",
      name: UNASSIGNED_NAME,
      unassigned: true,
      stated: false,
      order: diagram.lanes.length,
    }],
  };
}

export function withEdit(diagram) {
  return { ...diagram, manuallyEdited: true, reviewStatus: "draft" };
}

function laneByRole(lanes, role) {
  const key = norm(role);
  return lanes.find((lane) => !lane.unassigned && norm(lane.name) === key);
}

export function buildDiagram(process) {
  const lanes = [];
  const ensureLane = (role, explicit) => {
    if (!role || !explicit) {
      let lane = lanes.find((item) => item.unassigned);
      if (!lane) {
        lane = { id: "lane-unassigned", name: UNASSIGNED_NAME, unassigned: true, stated: false, order: 1000 };
        lanes.push(lane);
      }
      return lane;
    }
    const existing = laneByRole(lanes, role);
    if (existing) return existing;
    const lane = { id: uid(), name: role.trim(), unassigned: false, stated: true, order: lanes.length };
    lanes.push(lane);
    return lane;
  };

  const flowNodes = (process.nodes || []).filter((node) => node.type === "action" || node.type === "decision");
  const nodes = flowNodes.map((node) => {
    const named = Boolean(node.role) && (node.roleExplicit || node.inferred);
    const lane = ensureLane(node.role, named);
    let status = "stated";
    if (!named || node.unresolved) status = "unresolved";
    else if (!node.roleExplicit || node.inferred) status = "inferred";
    return {
      id: node.id || uid(),
      type: node.type,
      label: node.label,
      laneId: lane.id,
      status,
      structural: false,
      userAdded: false,
      stepNumber: node.stepNumber || null,
      extractedActionId: node.extractedActionId || null,
      source: {
        section: node.section || null,
        stepNumber: node.stepNumber || null,
        page: Number.isInteger(node.page) ? node.page : null,
        excerpt: node.excerpt || null,
      },
    };
  });

  const edges = [];
  const ending = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of process.edges || []) {
    if (!nodeIds.has(edge.from)) continue;
    if (edge.to === "__end__") {
      ending.push(edge);
      continue;
    }
    if (!nodeIds.has(edge.to) || edge.from === edge.to) continue;
    edges.push({
      id: edge.id || uid(),
      from: edge.from,
      to: edge.to,
      label: edge.label || "",
      kind: edge.kind || "sequence",
      stated: Boolean(edge.stated),
      userAdded: false,
      source: edge.excerpt ? { excerpt: edge.excerpt, section: null, stepNumber: null, page: null } : null,
    });
  }

  const startLane = nodes[0]?.laneId || (lanes[0]?.id ?? ensureLane(null, false).id);
  const endingFrom = new Set(ending.map((edge) => edge.from));
  const sinks = nodes.filter((node) => !edges.some((edge) => edge.from === node.id) && !endingFrom.has(node.id));
  const endAnchor = sinks[0] || nodes.find((node) => endingFrom.has(node.id)) || nodes[0];
  const endLane = endAnchor?.laneId || startLane;
  const start = {
    id: uid(),
    type: "start",
    label: "Start",
    laneId: startLane,
    status: "stated",
    structural: true,
    userAdded: false,
    stepNumber: null,
    extractedActionId: null,
    source: process.boundaries?.excerpt ? {
      section: process.boundaries.section || null,
      stepNumber: null,
      page: process.boundaries.page ?? null,
      excerpt: process.boundaries.excerpt,
    } : null,
  };
  const end = {
    id: uid(),
    type: "end",
    label: "End",
    laneId: endLane,
    status: "stated",
    structural: true,
    userAdded: false,
    stepNumber: null,
    extractedActionId: null,
    source: process.boundaries?.endExcerpt ? {
      section: process.boundaries.section || null,
      stepNumber: null,
      page: process.boundaries.page ?? null,
      excerpt: process.boundaries.endExcerpt,
    } : null,
  };
  for (const edge of ending) {
    edges.push({
      id: edge.id || uid(),
      from: edge.from,
      to: end.id,
      label: edge.label || "",
      kind: edge.kind || "sequence",
      stated: Boolean(edge.stated),
      userAdded: false,
      source: edge.excerpt ? { excerpt: edge.excerpt, section: null, stepNumber: null, page: null } : null,
    });
  }
  const sources = nodes.filter((node) => !edges.some((edge) => edge.to === node.id));
  for (const node of sources) {
    edges.push({
      id: uid(), from: start.id, to: node.id, label: "", kind: "sequence", stated: false, structural: true, userAdded: false, source: null,
    });
  }
  for (const node of sinks) {
    edges.push({
      id: uid(), from: node.id, to: end.id, label: "", kind: "sequence", stated: false, structural: true, userAdded: false, source: null,
    });
  }

  const statedLanes = lanes.filter((lane) => !lane.unassigned);
  const unassigned = lanes.filter((lane) => lane.unassigned);
  const ordered = [...statedLanes, ...unassigned].map((lane, index) => ({ ...lane, order: index }));

  return autoLayout({
    id: uid(),
    processId: process.id,
    processName: process.name,
    reviewStatus: "draft",
    manuallyEdited: false,
    lanes: ordered,
    nodes: [start, ...nodes, end],
    edges,
  });
}

export function moveLane(diagram, laneId, direction) {
  const lanes = [...diagram.lanes].sort((a, b) => a.order - b.order);
  const index = lanes.findIndex((lane) => lane.id === laneId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= lanes.length) return diagram;
  const swap = lanes[index];
  lanes[index] = lanes[next];
  lanes[next] = swap;
  return withEdit({ ...diagram, lanes: lanes.map((lane, order) => ({ ...lane, order })) });
}

export function addNode(diagram, { type, laneId }) {
  const next = ensureUnassigned(diagram);
  const lane = next.lanes.find((item) => item.id === laneId) || next.lanes.find((item) => item.unassigned) || next.lanes[0];
  const maxX = next.nodes.reduce((max, node) => Math.max(max, node.x || 0), LANE_LABEL_W);
  const node = {
    id: uid(),
    type,
    label: type === "decision" ? "New decision" : "New action",
    laneId: lane.id,
    x: maxX + 40,
    status: "unresolved",
    structural: false,
    userAdded: true,
    stepNumber: null,
    extractedActionId: null,
    source: null,
  };
  return { diagram: withEdit({ ...next, nodes: [...next.nodes, node] }), nodeId: node.id };
}

export function addExtractedAction(diagram, action) {
  const next = ensureUnassigned(diagram);
  let lane = next.lanes.find((item) => item.unassigned);
  if (action.roleText) {
    const match = laneByRole(next.lanes, action.roleText);
    if (match) lane = match;
  }
  const maxX = next.nodes.reduce((max, node) => Math.max(max, node.x || 0), LANE_LABEL_W);
  const node = {
    id: uid(),
    type: /decide|decision|whether/i.test(action.text) ? "decision" : "action",
    label: action.text,
    laneId: lane.id,
    x: maxX + 36,
    status: lane.unassigned ? "unresolved" : "stated",
    structural: false,
    userAdded: true,
    stepNumber: action.stepNumber || null,
    extractedActionId: action.id,
    source: {
      section: action.section || null,
      stepNumber: action.stepNumber || null,
      page: action.page ?? null,
      excerpt: action.excerpt || action.text,
    },
  };
  return { diagram: withEdit({ ...next, nodes: [...next.nodes, node] }), nodeId: node.id };
}
