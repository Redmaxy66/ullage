import { PDFDocument } from "pdf-lib";
import { diagramSvg } from "@shared/diagram.js";

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stem(filename) {
  return String(filename || "procedure").replace(/\.[^.]+$/, "") || "procedure";
}

export function exportSvg(diagram, filename) {
  const { svg, geom } = diagramSvg(diagram, { markerId: "export-arrow" });
  download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${stem(filename)}-swimlane.svg`);
  return geom;
}

async function rasterize(svg, width, height) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const loaded = new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The diagram could not be drawn for export."));
    });
    image.src = url;
    await loaded;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The diagram could not be drawn for export.");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(diagram, filename) {
  const { svg, geom } = diagramSvg(diagram, { markerId: "png-arrow" });
  const png = await rasterize(svg, geom.width, geom.height);
  download(png, `${stem(filename)}-swimlane.png`);
}

export async function exportPdf(diagram, filename) {
  const { svg, geom } = diagramSvg(diagram, { markerId: "pdf-arrow" });
  const png = await rasterize(svg, geom.width, geom.height);
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(await png.arrayBuffer());
  const page = pdf.addPage([geom.width, geom.height]);
  page.drawImage(image, { x: 0, y: 0, width: geom.width, height: geom.height });
  const bytes = await pdf.save();
  download(new Blob([bytes], { type: "application/pdf" }), `${stem(filename)}-swimlane.pdf`);
}
