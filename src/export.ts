import type { Paper, SvgExportMode } from "./types";

function lineKey(line: SVGLineElement): string {
  const endpoint = (x: string | null, y: string | null) => {
    const parsedX = Number.parseFloat(x ?? "");
    const parsedY = Number.parseFloat(y ?? "");
    return `${Number.isFinite(parsedX) ? parsedX.toFixed(6) : x},${Number.isFinite(parsedY) ? parsedY.toFixed(6) : y}`;
  };
  const start = endpoint(line.getAttribute("x1"), line.getAttribute("y1"));
  const end = endpoint(line.getAttribute("x2"), line.getAttribute("y2"));
  return [start, end].sort().join("|");
}

function removeDuplicateLines(svg: SVGSVGElement): void {
  const seen = new Set<string>();
  svg.querySelectorAll<SVGLineElement>("line").forEach((line) => {
    const key = lineKey(line);
    if (seen.has(key)) {
      line.remove();
      return;
    }
    seen.add(key);
  });
}
function exportClone(
  source: SVGSVGElement,
  includeBleedGuides: boolean,
  mode: SvgExportMode = "artwork"
): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.classList.remove("dieline-svg");
  clone.querySelectorAll('[data-preview-guide="safe"]').forEach((node) => node.remove());
  clone.querySelectorAll('[data-preview-only]').forEach((node) => node.remove());
  if (includeBleedGuides) {
    clone.querySelectorAll<SVGElement>('[data-preview-guide="bleed"]').forEach((node) => {
      node.style.removeProperty("display");
    });
  } else {
    clone.querySelectorAll('[data-preview-guide="bleed"]').forEach((node) => node.remove());
  }
  if (mode === "cut") {
    clone.querySelectorAll('[data-export-layer="page-background"]').forEach((node) => node.remove());
    clone.querySelectorAll('[data-export-layer="artwork"]').forEach((node) => node.remove());
    clone.querySelectorAll('[data-export-layer="flap-fill"]').forEach((node) => node.remove());
    clone.querySelectorAll("pattern, clipPath").forEach((node) => node.remove());
    clone.querySelectorAll<SVGElement>('[data-export-layer="cut-lines"], [data-export-layer="fold-lines"], .cut-shape').forEach((node) => {
      node.style.removeProperty("display");
    });
    removeDuplicateLines(clone);
  }
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return clone;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadSvg(
  source: SVGSVGElement,
  includeBleedGuides: boolean,
  mode: SvgExportMode = "artwork",
  filename = "tuckbox-template.svg"
) {
  const clone = exportClone(source, includeBleedGuides, mode);
  const serialized = new XMLSerializer().serializeToString(clone);
  download(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export async function downloadPdf(
  source: SVGSVGElement,
  paper: Paper,
  includeBleedGuides: boolean,
  filename = "tuckbox-template.pdf"
) {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const clone = exportClone(source, includeBleedGuides, "artwork");
  document.body.appendChild(clone);
  clone.style.position = "fixed";
  clone.style.left = "-10000px";

  try {
    const pdf = new jsPDF({
      orientation: paper.orientation === "portrait" ? "p" : "l",
      unit: "mm",
      format: [paper.width, paper.height],
      compress: true
    });
    await pdf.svg(clone, { x: 0, y: 0, width: paper.width, height: paper.height });
    pdf.save(filename);
  } finally {
    clone.remove();
  }
}
