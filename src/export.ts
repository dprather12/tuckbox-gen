import type { Paper } from "./types";

function exportClone(source: SVGSVGElement, includeBleedGuides: boolean): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.classList.remove("dieline-svg");
  clone.querySelectorAll('[data-preview-guide="safe"]').forEach((node) => node.remove());
  if (includeBleedGuides) {
    clone.querySelectorAll<SVGElement>('[data-preview-guide="bleed"]').forEach((node) => {
      node.style.removeProperty("display");
    });
  } else {
    clone.querySelectorAll('[data-preview-guide="bleed"]').forEach((node) => node.remove());
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
  filename = "tuckbox-template.svg"
) {
  const clone = exportClone(source, includeBleedGuides);
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
  const clone = exportClone(source, includeBleedGuides);
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
