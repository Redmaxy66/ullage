import path from "node:path";
import mammoth from "mammoth";
import { parse as parseHtml } from "node-html-parser";
import { unzipSync } from "fflate";
import { HttpError } from "./http.js";

const STEP_RE = /^(?:step\s+)?(\d+(?:\.\d+)*)\s+([\s\S]+)$/i;

function clean(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function uid() {
  return crypto.randomUUID();
}

export function sniffUpload(buffer, filename) {
  const ext = path.extname(filename || "").toLowerCase();
  if (ext !== ".docx" && ext !== ".pdf") {
    throw new HttpError(415, `Upload a Word (.docx) or text-based PDF. “${filename || "This file"}” is not a supported type.`);
  }
  const isPdf = buffer.subarray(0, 5).toString("latin1").startsWith("%PDF");
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
  if (ext === ".pdf" && !isPdf) {
    throw new HttpError(400, "This file ends in .pdf but its contents are not a PDF.");
  }
  if (ext === ".docx" && isOle) {
    throw new HttpError(400, "This looks like an older Word file or an encrypted document. Save it as a .docx file without a password and upload that.");
  }
  if (ext === ".docx" && !isZip) {
    throw new HttpError(400, "This file ends in .docx but its contents are not a Word document.");
  }
  return ext === ".pdf" ? "pdf" : "docx";
}

function assertDocxZip(buffer) {
  let entries;
  try {
    entries = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new HttpError(400, "This Word file could not be read. It may be damaged.");
  }
  const names = Object.keys(entries).map((name) => name.replace(/\\/g, "/"));
  if (names.some((name) => /encryptioninfo|encryptedpackage/i.test(name))) {
    throw new HttpError(400, "This Word file is password-protected. Remove the password and upload it again.");
  }
  if (!names.includes("word/document.xml")) {
    throw new HttpError(400, "This file is not a Word document. Upload a .docx file.");
  }
}

function readVersionInfo(text) {
  const version = text.match(/\bversion\s*[:#]?\s*([0-9]+(?:\.[0-9]+)*)/i)?.[1] ?? null;
  const effective = text.match(/\beffective date\s*[:.]?\s*([^\n\r]+)/i)?.[1]?.trim() ?? null;
  const documentNumber = text.match(/\b((?:SOP|WI|PROC)-[A-Z0-9-]+)\b/)?.[1] ?? null;
  return {
    version,
    effectiveDate: effective ? effective.replace(/\s+/g, " ").replace(/[.].*$/, (m) => (m.length > 1 ? "" : m)).trim() : null,
    documentNumber,
  };
}

function readBoundaries(text) {
  const boundaries = [];
  const pattern = /([^.!\n]*\bstarts when\b[^.!\n]*\bends when\b[^.!\n]*[.!?]?)/gi;
  for (const match of text.matchAll(pattern)) {
    const excerpt = clean(match[1]);
    const parts = excerpt.match(/starts when\s+(.+?)\s+and ends when\s+(.+)/i);
    if (!excerpt || !parts) continue;
    boundaries.push({
      excerpt,
      startsWhen: parts[1].replace(/[.]+$/, "").trim(),
      endsWhen: parts[2].replace(/[.]+$/, "").trim(),
    });
  }
  return boundaries;
}

function asStep(text) {
  const match = clean(text).match(STEP_RE);
  if (!match) return null;
  const stepNumber = match[1];
  const body = clean(match[2]);
  if (!body || body.length < 8) return null;
  if (!stepNumber.includes(".") && !/^step\s+/i.test(text) && body.split(/\s+/).length < 5) return null;
  return { stepNumber, body };
}

function readingNote(text, where) {
  if (/\bsomeone\b/i.test(text)) {
    return `${where} says “someone” and does not name a role.`;
  }
  if (/\b(not named|tbd|to be determined|as appropriate)\b/i.test(text)) {
    return `${where} does not name a responsible role.`;
  }
  return null;
}

function pushAction(bag, action) {
  const where = action.stepNumber ? `Step ${action.stepNumber}` : "A step";
  const roleBlank = action.roleColumn && (!action.roleText || /^(not named|n\/a|tbd|—|-|unassigned)$/i.test(action.roleText.trim()));
  if (roleBlank) {
    bag.notes.push({
      id: uid(),
      message: `${where} does not name a responsible role.`,
      excerpt: action.excerpt,
    });
  }
  const note = readingNote(`${action.roleText || ""} ${action.text}`, where);
  if (note && !roleBlank) bag.notes.push({ id: uid(), message: note, excerpt: action.excerpt });
  bag.actions.push(action);
}

function consumeText(bag, text, { section, page, listNumber = null }) {
  const value = clean(text);
  if (!value) return;
  const stepped = asStep(value);
  if (stepped || listNumber) {
    const stepNumber = stepped?.stepNumber || String(listNumber);
    const body = stepped?.body || value;
    const action = {
      id: uid(),
      stepNumber,
      roleText: null,
      roleColumn: false,
      text: body,
      routing: null,
      section,
      page,
      excerpt: body,
    };
    bag.blocks.push({ id: uid(), type: "step", text: `${stepNumber} ${body}`, stepNumber, section, page });
    pushAction(bag, action);
    return;
  }
  const type = value.length < 70 && !/[.]$/.test(value) && bag.blocks.at(-1)?.type !== "paragraph" ? "paragraph" : "paragraph";
  bag.blocks.push({ id: uid(), type, text: value, section, page });
}

function consumeTable(bag, rows, section, page) {
  const cleaned = rows.map((row) => row.map((cell) => clean(cell))).filter((row) => row.some(Boolean));
  if (!cleaned.length) return;
  bag.blocks.push({ id: uid(), type: "table", rows: cleaned, section, page });
  const header = cleaned[0].map((cell) => cell.toLowerCase());
  const stepCol = header.findIndex((cell) => /\bstep\b/.test(cell));
  const roleCol = header.findIndex((cell) => /role|owner|responsible/.test(cell));
  const actionCol = header.findIndex((cell) => /action|task|activity|description/.test(cell));
  const routeCol = header.findIndex((cell) => /rout|next|branch/.test(cell));
  if (stepCol < 0 || actionCol < 0) return;
  for (const row of cleaned.slice(1)) {
    const text = clean(row[actionCol] || "");
    if (!text) continue;
    const rawStep = clean(row[stepCol] || "");
    const stepMatch = rawStep.match(/(\d+(?:\.\d+)*)/);
    const roleText = roleCol >= 0 ? clean(row[roleCol] || "") : "";
    const routing = routeCol >= 0 ? clean(row[routeCol] || "") : "";
    pushAction(bag, {
      id: uid(),
      stepNumber: stepMatch ? stepMatch[1] : null,
      roleText: roleText || null,
      roleColumn: true,
      text,
      routing: routing || null,
      section,
      page,
      excerpt: text,
    });
  }
}

function blocksFromHtml(html) {
  const root = parseHtml(html);
  const bag = { blocks: [], actions: [], notes: [], section: null };

  const walk = (node, listNumber = null) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) continue;
      const tag = child.tagName?.toLowerCase();
      if (!tag) continue;
      if (/^h[1-6]$/.test(tag)) {
        const text = clean(child.text);
        if (text) {
          bag.section = text;
          bag.blocks.push({ id: uid(), type: "heading", level: Number(tag[1]), text, section: text, page: null });
        }
      } else if (tag === "p") {
        consumeText(bag, child.text, { section: bag.section, page: null });
      } else if (tag === "li") {
        consumeText(bag, child.text, { section: bag.section, page: null, listNumber });
      } else if (tag === "ol" || tag === "ul") {
        let number = 1;
        for (const item of child.childNodes || []) {
          if (item.tagName?.toLowerCase() === "li") {
            walk(item.parentNode && item.tagName ? { childNodes: [item] } : item, tag === "ol" ? number : null);
            if (tag === "ol") number += 1;
          }
        }
      } else if (tag === "table") {
        const rows = [];
        for (const tr of child.querySelectorAll("tr")) {
          rows.push([...tr.querySelectorAll("th,td")].map((cell) => cell.text));
        }
        consumeTable(bag, rows, bag.section, null);
      } else if (tag !== "li") {
        walk(child);
      }
    }
  };

  // List items are handled inside ol/ul. walk() on li would double-count if we also recurse.
  const walkSafe = (node) => {
    for (const child of node.childNodes || []) {
      if (child.nodeType === 3) continue;
      const tag = child.tagName?.toLowerCase();
      if (!tag) continue;
      if (/^h[1-6]$/.test(tag)) {
        const text = clean(child.text);
        if (text) {
          bag.section = text;
          bag.blocks.push({ id: uid(), type: "heading", level: Number(tag[1]), text, section: text, page: null });
        }
      } else if (tag === "p") {
        consumeText(bag, child.text, { section: bag.section, page: null });
      } else if (tag === "ol" || tag === "ul") {
        let number = 1;
        for (const item of child.childNodes || []) {
          if (item.tagName?.toLowerCase() !== "li") continue;
          const ownText = item.childNodes
            .filter((inner) => inner.nodeType === 3 || inner.tagName?.toLowerCase() === "p" || inner.tagName?.toLowerCase() === "span")
            .map((inner) => inner.text)
            .join(" ");
          consumeText(bag, ownText || item.text, { section: bag.section, page: null, listNumber: tag === "ol" ? number : null });
          if (tag === "ol") number += 1;
        }
      } else if (tag === "table") {
        const rows = [];
        for (const tr of child.querySelectorAll("tr")) {
          rows.push([...tr.querySelectorAll("th,td")].map((cell) => cell.text));
        }
        consumeTable(bag, rows, bag.section, null);
      } else {
        walkSafe(child);
      }
    }
  };

  walkSafe(root);
  void walk;
  return bag;
}

function titleFrom(blocks, versionInfo) {
  const heading = blocks.find((block) => block.type === "heading" && !/^sop-/i.test(block.text));
  if (heading) return heading.text;
  return versionInfo.documentNumber || null;
}

async function extractDocx(buffer, filename) {
  assertDocxZip(buffer);
  let html;
  let raw;
  try {
    html = await mammoth.convertToHtml({ buffer });
    raw = await mammoth.extractRawText({ buffer });
  } catch (error) {
    const message = String(error?.message || "");
    if (/password|encrypt/i.test(message)) {
      throw new HttpError(400, "This Word file is password-protected. Remove the password and upload it again.");
    }
    throw new HttpError(400, "This Word file could not be read. It may be damaged.");
  }
  const fullText = clean(raw.value || "");
  if (!fullText) {
    throw new HttpError(422, "No readable text was found in this Word file. A diagram was not created.");
  }
  const bag = blocksFromHtml(html.value || "");
  const versionInfo = readVersionInfo(fullText);
  return {
    kind: "docx",
    filename,
    title: titleFrom(bag.blocks, versionInfo),
    versionInfo,
    fullText,
    pages: null,
    blocks: bag.blocks,
    actions: bag.actions,
    notes: bag.notes,
    boundaries: readBoundaries(fullText),
    blocking: null,
  };
}

function linesFromTextContent(textContent) {
  const grouped = new Map();
  for (const item of textContent.items) {
    const str = item.str || "";
    if (!str.trim()) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    const width = item.width || 0;
    const size = Math.abs(item.transform?.[3] || item.height || 11);
    if (!grouped.has(y)) grouped.set(y, []);
    grouped.get(y).push({ x, width, str, size });
  }
  return [...grouped.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([y, items]) => {
      items.sort((a, b) => a.x - b.x);
      const cells = [];
      let cell = null;
      let lastEnd = null;
      let maxSize = 11;
      for (const item of items) {
        maxSize = Math.max(maxSize, item.size || 11);
        const gap = lastEnd == null ? 0 : item.x - lastEnd;
        if (lastEnd != null && gap > 16) {
          if (cell?.text.trim()) cells.push({ x: cell.x, text: cell.text.trim() });
          cell = { x: item.x, text: item.str };
        } else if (!cell) {
          cell = { x: item.x, text: item.str };
        } else if (gap > 1.1) {
          cell.text += ` ${item.str}`;
        } else {
          cell.text += item.str;
        }
        lastEnd = item.x + (item.width || 0);
      }
      if (cell?.text.trim()) cells.push({ x: cell.x, text: cell.text.trim() });
      return {
        y,
        size: maxSize,
        cells,
        text: cells.map((entry) => entry.text).join(" ").replace(/\s+/g, " ").trim(),
      };
    })
    .filter((line) => line.text);
}

function mergeWrappedRows(lines) {
  const merged = [];
  for (const line of lines) {
    const prev = merged.at(-1);
    const gap = prev ? prev.y - line.y : 999;
    if (prev && gap > 0 && gap <= 12) {
      for (const cell of line.cells) {
        let nearest = prev.cells[0];
        let best = Infinity;
        for (const existing of prev.cells) {
          const distance = Math.abs(existing.x - cell.x);
          if (distance < best) {
            best = distance;
            nearest = existing;
          }
        }
        if (nearest && best <= 36) nearest.text = `${nearest.text} ${cell.text}`.replace(/\s+/g, " ").trim();
        else prev.cells.push({ ...cell });
      }
      prev.text = prev.cells.map((entry) => entry.text).join(" ");
      prev.size = Math.max(prev.size, line.size);
      continue;
    }
    merged.push({
      y: line.y,
      size: line.size,
      cells: line.cells.map((entry) => ({ ...entry })),
      text: line.text,
    });
  }
  return merged;
}

function blocksFromPdfPages(pageLines) {
  const bag = { blocks: [], actions: [], notes: [], section: null };
  for (const page of pageLines) {
    const lines = mergeWrappedRows(page.lines);
    let index = 0;
    while (index < lines.length) {
      const line = lines[index];
      const tabular = line.cells.length >= 3;
      if (tabular) {
        const rows = [];
        while (index < lines.length && lines[index].cells.length >= 3 && lines[index].y >= line.y - 400) {
          rows.push(lines[index].cells.map((entry) => entry.text));
          index += 1;
          if (rows.length > 1 && lines[index - 1] && index < lines.length) {
            const gap = lines[index - 1].y - lines[index].y;
            if (gap > 56) break;
          }
        }
        consumeTable(bag, rows, bag.section, page.page);
        continue;
      }
      const paragraph = [line.text];
      const size = line.size;
      index += 1;
      while (index < lines.length) {
        const next = lines[index];
        if (next.cells.length >= 3) break;
        const gap = lines[index - 1].y - next.y;
        if (gap > 16) break;
        paragraph.push(next.text);
        index += 1;
      }
      const text = clean(paragraph.join(" "));
      const isHeading = text.length < 80 && size >= 13.5 && !asStep(text);
      if (isHeading) {
        bag.section = text;
        bag.blocks.push({ id: uid(), type: "heading", level: size >= 16 ? 1 : 2, text, section: text, page: page.page });
      } else {
        consumeText(bag, text, { section: bag.section, page: page.page });
      }
    }
  }
  return bag;
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjs;
}

async function extractPdf(buffer, filename) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(buffer);
  let doc;
  try {
    const task = pdfjs.getDocument({
      data,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    doc = await task.promise;
  } catch (error) {
    const name = error?.name || "";
    const message = String(error?.message || "");
    if (name === "PasswordException" || /password/i.test(message)) {
      throw new HttpError(400, "This PDF is password-protected. Remove the password and upload it again.");
    }
    throw new HttpError(400, "This PDF could not be read. It may be damaged.");
  }

  const pages = [];
  const ocrPages = [];
  try {
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const textContent = await page.getTextContent();
      const lines = linesFromTextContent(textContent);
      const text = lines.map((line) => line.text).join("\n");
      const characters = (text.match(/[A-Za-z0-9]/g) || []).length;
      let hasImage = false;
      try {
        const opList = await page.getOperatorList();
        const ops = pdfjs.OPS || {};
        const paint = new Set([
          ops.paintImageXObject,
          ops.paintJpegXObject,
          ops.paintImageXObjectRepeat,
          ops.paintInlineImageXObject,
        ].filter((code) => code != null));
        hasImage = opList.fnArray.some((fn) => paint.has(fn));
      } catch {
        hasImage = false;
      }
      const blank = characters < 8 && !hasImage;
      const readable = blank || characters >= 40 || (characters >= 15 && !hasImage);
      if (!blank && !readable) ocrPages.push(number);
      pages.push({ page: number, text, lines, characters, readable: blank ? true : readable, blank });
    }
  } finally {
    await doc.destroy?.();
  }

  const fullText = pages.filter((page) => !page.blank).map((page) => page.text).join("\n\n");
  if (ocrPages.length) {
    const listed = ocrPages.length === 1 ? `page ${ocrPages[0]}` : `pages ${ocrPages.join(", ")}`;
    throw new HttpError(422, `This PDF has no readable text on ${listed}. Those pages look scanned or pictured. This version does not include OCR, so no diagram was created. Upload a text-based PDF or a Word file instead.`);
  }
  if ((fullText.match(/[A-Za-z0-9]/g) || []).length < 40) {
    throw new HttpError(422, "Almost no text could be read from this PDF. If the pages are scans or pictures, OCR is required before a diagram can be made. No diagram was created.");
  }

  const bag = blocksFromPdfPages(pages);
  const versionInfo = readVersionInfo(fullText);
  return {
    kind: "pdf",
    filename,
    title: titleFrom(bag.blocks, versionInfo),
    versionInfo,
    fullText,
    pages: pages.map(({ lines, ...page }) => page),
    blocks: bag.blocks,
    actions: bag.actions,
    notes: bag.notes,
    boundaries: readBoundaries(fullText),
    blocking: null,
  };
}

export async function extractDocument(buffer, filename) {
  const kind = sniffUpload(buffer, filename);
  const extraction = kind === "pdf" ? await extractPdf(buffer, filename) : await extractDocx(buffer, filename);
  if (!extraction.actions.length && !extraction.blocks.length) {
    throw new HttpError(422, "The file opened, but no procedure text could be found. A diagram was not created.");
  }
  return extraction;
}
