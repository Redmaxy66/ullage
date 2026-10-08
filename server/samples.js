import fs from "node:fs/promises";
import path from "node:path";
import {
  Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { rootDir } from "./db.js";

const REV = "1";

export const SAMPLE_CATALOG = [
  {
    id: "inbound-inspection-docx",
    file: "inbound-quality-inspection.docx",
    format: "Word",
    title: "Inbound quality inspection",
    summary: "Receiving Clerk, Quality Inspector, Supervisor, and Inventory Clerk. Includes a decision, a rework loop, a step with no named owner, and a second procedure for damaged freight claims.",
  },
  {
    id: "inbound-inspection-pdf",
    file: "inbound-quality-inspection.pdf",
    format: "PDF",
    title: "Inbound quality inspection",
    summary: "The same inspection procedure as a text-based PDF, with page text that can be read without OCR.",
  },
  {
    id: "pack-and-ship-docx",
    file: "pack-and-ship.docx",
    format: "Word",
    title: "Pack and ship (table)",
    summary: "A table-based pack and ship procedure. Picker, Packer, and Shipper, with a count decision, a rework loop, and one row that does not name an owner.",
  },
  {
    id: "pack-and-ship-pdf",
    file: "pack-and-ship.pdf",
    format: "PDF",
    title: "Pack and ship (table)",
    summary: "The same table-based procedure as a text-based PDF.",
  },
];

function p(text, extras = {}) {
  return new Paragraph({
    spacing: { after: extras.after ?? 160 },
    heading: extras.heading,
    children: [new TextRun({ text, bold: extras.bold, size: extras.size })],
  });
}

function cell(text, width, header = false) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: header, size: 18 })],
    })],
  });
}

function table(headers, rows, widths) {
  const all = [headers, ...rows];
  return new Table({
    width: { size: widths.reduce((sum, width) => sum + width, 0), type: WidthType.DXA },
    rows: all.map((row, index) => new TableRow({
      tableHeader: index === 0,
      children: row.map((value, cellIndex) => cell(String(value), widths[cellIndex], index === 0)),
    })),
  });
}

function inboundDoc() {
  return new Document({
    sections: [{
      children: [
        p("SOP-WH-014", { bold: true, after: 80 }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Inbound Quality Inspection")] }),
        p("Version 2.3"),
        p("Effective date: 1 March 2026"),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Purpose")] }),
        p("This procedure starts when a delivery arrives at the inbound door and ends when the accepted lot is released to inventory or the rejected lot is dispositioned."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Roles")] }),
        p("Receiving Clerk - receives the delivery and stages the cartons."),
        p("Quality Inspector - inspects the sample and records the result."),
        p("Supervisor - decides the disposition of a failed lot."),
        p("Inventory Clerk - releases a hold and posts the accepted quantity."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Procedure")] }),
        p("3.1 The Receiving Clerk matches the packing list to the purchase order and records the receipt number on the inbound log."),
        p("3.2 The Receiving Clerk stages the cartons in the inbound inspection area and applies a hold label."),
        p("3.3 Someone on the receiving team photographs cartons that arrive damaged before they are moved."),
        p("3.4 The Quality Inspector inspects a sample using the sampling table in Appendix A and records the result on the inspection form."),
        p("3.5 Decision: Does the sample meet the acceptance criteria?"),
        p("If the sample meets the acceptance criteria, continue at step 3.9."),
        p("If the sample does not meet the acceptance criteria, continue at step 3.6."),
        p("3.6 The Quality Inspector quarantines the lot and notifies the Supervisor."),
        p("3.7 The Supervisor chooses a disposition for the quarantined lot."),
        p("If the lot is returned to the supplier, the procedure ends for that lot."),
        p("If the lot is sent back for inspection, continue at step 3.8."),
        p("3.8 The Receiving Clerk replaces the hold label. The lot returns to step 3.4."),
        p("3.9 The Inventory Clerk releases the hold and posts the accepted quantity to inventory."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Procedure: Damaged freight claim")] }),
        p("This separate procedure starts when damage is found after the driver has left and ends when the claim is filed."),
        p("4.1 The Receiving Clerk sets the damaged cartons aside and keeps the packaging."),
        p("4.2 The Supervisor reviews the photos and approves the claim."),
        p("4.3 The Inventory Clerk files the carrier claim and records the claim number."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Appendix A. Sampling reference")] }),
        table(
          ["Lot size", "Sample size"],
          [["1-20", "2"], ["21-50", "5"], ["51-100", "8"]],
          [4680, 4680],
        ),
      ],
    }],
  });
}

function packDoc() {
  return new Document({
    sections: [{
      children: [
        p("SOP-DC-022", { bold: true, after: 80 }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Pack and Ship")] }),
        p("Version 1.4"),
        p("Effective date: 12 January 2026"),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Purpose")] }),
        p("This procedure starts when an order is released to the floor and ends when the carton is staged for the carrier."),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Procedure")] }),
        table(
          ["Step", "Role", "Action", "Routing"],
          [
            ["1", "Picker", "Pick the items listed on the order from the pick face and place them in the order tote.", "Continue to step 2"],
            ["2", "Packer", "Count the items in the tote against the order.", "Continue to the decision in step 3"],
            ["3", "Packer", "Decide whether the count matches the order.", "If the count matches, go to step 5. If the count does not match, go to step 4."],
            ["4", "Picker", "Correct the pick and return the tote to the Packer.", "Return to step 2"],
            ["5", "Packer", "Seal the carton and apply the shipping label.", "Continue to step 6"],
            ["6", "Shipper", "Stage the carton in the carrier lane for collection.", "The procedure ends"],
            ["7", "Not named", "Record a shortage on the exception log when an item is missing from the pick face.", "The procedure does not state who records the shortage."],
          ],
          [900, 1400, 4860, 2200],
        ),
      ],
    }],
  });
}

function wrapLine(text, font, size, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function drawNarrative(titleLines, blocks) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 800;
  const margin = 48;
  const width = 500;
  const ink = rgb(0.11, 0.14, 0.19);

  const ensure = (needed) => {
    if (y - needed < 48) {
      page = pdf.addPage([595.28, 841.89]);
      y = 800;
    }
  };

  const draw = (text, { size, face, gapAfter }) => {
    const lines = wrapLine(text, face, size, width);
    ensure(lines.length * (size + 4) + gapAfter + 8);
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font: face, color: ink });
      y -= size + 4;
    }
    y -= gapAfter;
  };

  for (const line of titleLines) draw(line.text, { size: line.size, face: line.bold ? bold : font, gapAfter: line.gap ?? 8 });
  for (const block of blocks) {
    if (block.heading) draw(block.text, { size: 15, face: bold, gapAfter: 8 });
    else draw(block.text, { size: 11, face: font, gapAfter: 10 });
  }
  return Buffer.from(await pdf.save());
}

async function inboundPdf() {
  return drawNarrative(
    [
      { text: "SOP-WH-014", size: 12, bold: true, gap: 6 },
      { text: "Inbound Quality Inspection", size: 18, bold: true, gap: 8 },
      { text: "Version 2.3", size: 11, bold: false, gap: 4 },
      { text: "Effective date: 1 March 2026", size: 11, bold: false, gap: 12 },
    ],
    [
      { heading: true, text: "Purpose" },
      { text: "This procedure starts when a delivery arrives at the inbound door and ends when the accepted lot is released to inventory or the rejected lot is dispositioned." },
      { heading: true, text: "Roles" },
      { text: "Receiving Clerk - receives the delivery and stages the cartons." },
      { text: "Quality Inspector - inspects the sample and records the result." },
      { text: "Supervisor - decides the disposition of a failed lot." },
      { text: "Inventory Clerk - releases a hold and posts the accepted quantity." },
      { heading: true, text: "Procedure" },
      { text: "3.1 The Receiving Clerk matches the packing list to the purchase order and records the receipt number on the inbound log." },
      { text: "3.2 The Receiving Clerk stages the cartons in the inbound inspection area and applies a hold label." },
      { text: "3.3 Someone on the receiving team photographs cartons that arrive damaged before they are moved." },
      { text: "3.4 The Quality Inspector inspects a sample using the sampling table in Appendix A and records the result on the inspection form." },
      { text: "3.5 Decision: Does the sample meet the acceptance criteria?" },
      { text: "If the sample meets the acceptance criteria, continue at step 3.9." },
      { text: "If the sample does not meet the acceptance criteria, continue at step 3.6." },
      { text: "3.6 The Quality Inspector quarantines the lot and notifies the Supervisor." },
      { text: "3.7 The Supervisor chooses a disposition for the quarantined lot." },
      { text: "If the lot is returned to the supplier, the procedure ends for that lot." },
      { text: "If the lot is sent back for inspection, continue at step 3.8." },
      { text: "3.8 The Receiving Clerk replaces the hold label. The lot returns to step 3.4." },
      { text: "3.9 The Inventory Clerk releases the hold and posts the accepted quantity to inventory." },
      { heading: true, text: "Procedure: Damaged freight claim" },
      { text: "This separate procedure starts when damage is found after the driver has left and ends when the claim is filed." },
      { text: "4.1 The Receiving Clerk sets the damaged cartons aside and keeps the packaging." },
      { text: "4.2 The Supervisor reviews the photos and approves the claim." },
      { text: "4.3 The Inventory Clerk files the carrier claim and records the claim number." },
    ],
  );
}

async function packPdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([841.89, 595.28]);
  const ink = rgb(0.11, 0.14, 0.19);
  const line = rgb(0.75, 0.7, 0.62);
  let y = 560;
  const left = 36;
  page.drawText("SOP-DC-022", { x: left, y, size: 11, font: bold, color: ink });
  y -= 22;
  page.drawText("Pack and Ship", { x: left, y, size: 18, font: bold, color: ink });
  y -= 18;
  page.drawText("Version 1.4", { x: left, y, size: 11, font, color: ink });
  y -= 14;
  page.drawText("Effective date: 12 January 2026", { x: left, y, size: 11, font, color: ink });
  y -= 22;
  page.drawText("Purpose", { x: left, y, size: 14, font: bold, color: ink });
  y -= 16;
  page.drawText("This procedure starts when an order is released to the floor and ends when the carton is staged for the carrier.", {
    x: left, y, size: 11, font, color: ink,
  });
  y -= 28;
  page.drawText("Procedure", { x: left, y, size: 14, font: bold, color: ink });
  y -= 16;

  const columns = [46, 100, 340, 280];
  const rows = [
    ["Step", "Role", "Action", "Routing"],
    ["1", "Picker", "Pick the items on the order from the pick face into the order tote.", "Continue to step 2"],
    ["2", "Packer", "Count the items in the tote against the order.", "Continue to the decision in step 3"],
    ["3", "Packer", "Decide whether the count matches the order.", "If the count matches, go to step 5. If the count does not match, go to step 4."],
    ["4", "Picker", "Correct the pick and return the tote to the Packer.", "Return to step 2"],
    ["5", "Packer", "Seal the carton and apply the shipping label.", "Continue to step 6"],
    ["6", "Shipper", "Stage the carton in the carrier lane for collection.", "The procedure ends"],
    ["7", "Not named", "Record a shortage on the exception log when an item is missing from the pick face.", "The procedure does not state who records the shortage."],
  ];
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  for (const row of rows) {
    const face = row === rows[0] ? bold : font;
    const wrapped = row.map((value, index) => wrapLine(value, face, 8.5, columns[index] - 8));
    const lineCount = Math.max(...wrapped.map((lines) => lines.length));
    const rowH = 14 + lineCount * 11;
    page.drawRectangle({ x: left, y: y - rowH + 16, width: tableWidth, height: rowH, borderColor: line, borderWidth: 0.6 });
    let x = left + 4;
    wrapped.forEach((lines, index) => {
      lines.forEach((text, lineIndex) => {
        page.drawText(text, { x, y: y - lineIndex * 11, size: 8.5, font: face, color: ink });
      });
      x += columns[index];
    });
    y -= rowH;
  }
  return Buffer.from(await pdf.save());
}

async function imageOnlyPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 40, y: 40, width: 515, height: 760 });
  return Buffer.from(await pdf.save());
}

export function samplesDir() {
  return path.join(rootDir(), "samples");
}

export async function ensureSamples() {
  const dir = samplesDir();
  await fs.mkdir(dir, { recursive: true });
  const stampPath = path.join(dir, ".rev");
  let current = "";
  try {
    current = await fs.readFile(stampPath, "utf8");
  } catch {
    current = "";
  }
  if (current === REV) return;
  const inboundDocx = await Packer.toBuffer(inboundDoc());
  const packDocx = await Packer.toBuffer(packDoc());
  await fs.writeFile(path.join(dir, "inbound-quality-inspection.docx"), inboundDocx);
  await fs.writeFile(path.join(dir, "inbound-quality-inspection.pdf"), await inboundPdf());
  await fs.writeFile(path.join(dir, "pack-and-ship.docx"), packDocx);
  await fs.writeFile(path.join(dir, "pack-and-ship.pdf"), await packPdf());
  await fs.writeFile(path.join(dir, "image-only.pdf"), await imageOnlyPdf());
  await fs.writeFile(stampPath, REV);
}

export function sampleById(id) {
  return SAMPLE_CATALOG.find((sample) => sample.id === id) || null;
}
