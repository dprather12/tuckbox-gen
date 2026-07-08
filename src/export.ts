import type { Paper, SvgExportMode } from "./types";
import { strToU8, zipSync } from "fflate";

const SVG_NS = "http://www.w3.org/2000/svg";
const CRICUT_RASTER_DPI = 300;

interface SvgBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
function localReferenceId(reference: string | null): string | undefined {
  if (!reference?.startsWith("#")) return undefined;
  try {
    return decodeURIComponent(reference.slice(1));
  } catch {
    return reference.slice(1);
  }
}

function flattenUseReferences(svg: SVGSVGElement): void {
  svg.querySelectorAll<SVGUseElement>("use").forEach((use) => {
    const id = localReferenceId(use.getAttribute("href") ?? use.getAttribute("xlink:href"));
    if (!id) return;

    const referenced = svg.getElementById(id);
    if (!referenced) return;

    const replacement = referenced.cloneNode(true) as SVGElement;
    replacement.removeAttribute("id");
    replacement.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));

    const inheritedTransform = use.getAttribute("transform");
    const offsetTransform =
      use.hasAttribute("x") || use.hasAttribute("y")
        ? `translate(${use.getAttribute("x") ?? "0"} ${use.getAttribute("y") ?? "0"})`
        : undefined;
    const existingTransform = replacement.getAttribute("transform");
    const transforms = [inheritedTransform, existingTransform, offsetTransform].filter(Boolean);

    if (transforms.length > 0) {
      replacement.setAttribute("transform", transforms.join(" "));
    }

    Array.from(use.attributes).forEach((attribute) => {
      if (["href", "xlink:href", "x", "y", "transform"].includes(attribute.name)) return;
      replacement.setAttribute(attribute.name, attribute.value);
    });

    use.replaceWith(replacement);
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
  clone.querySelectorAll('[data-export-layer="cricut-silhouette"]').forEach((node) => node.remove());
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

function cleanCricutPrintClone(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  clone.classList.remove("dieline-svg");
  clone.querySelectorAll(
    '[data-preview-guide], [data-preview-only], [data-export-layer="page-background"], ' +
    '[data-export-layer="cut-lines"], [data-export-layer="fold-lines"], .cut-shape'
  ).forEach((node) => node.remove());
  clone.querySelectorAll<SVGElement>('[data-export-layer="cricut-silhouette"]').forEach((layer) => {
    layer.style.removeProperty("display");
    layer.querySelectorAll<SVGElement>("path, polygon, rect").forEach((shape) => {
      shape.setAttribute("fill", "#fff");
      shape.setAttribute("stroke", "none");
    });
  });
  clone.setAttribute("xmlns", SVG_NS);
  return clone;
}

function transformedCopy(transform?: string): SVGGElement {
  const group = document.createElementNS(SVG_NS, "g");
  if (transform) group.setAttribute("transform", transform);
  return group;
}

function useTransform(use: SVGUseElement): string | undefined {
  const transform = use.getAttribute("transform");
  const x = use.getAttribute("x");
  const y = use.getAttribute("y");
  const position = x !== null || y !== null ? `translate(${x ?? "0"} ${y ?? "0"})` : undefined;
  return [transform, position].filter(Boolean).join(" ") || undefined;
}

function createCricutOperationsClone(source: SVGSVGElement, bounds: SvgBounds): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const baseCopy = clone.querySelector<SVGGElement>('g[id$="-dieline-copy"]');
  if (!baseCopy) throw new Error("The Cricut package could not locate the dieline.");

  const root = document.createElementNS(SVG_NS, "svg");
  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  root.setAttribute("width", `${bounds.width}mm`);
  root.setAttribute("height", `${bounds.height}mm`);

  const definitions = document.createElementNS(SVG_NS, "defs");
  clone.querySelectorAll("defs > style").forEach((style) => {
    definitions.appendChild(style.cloneNode(true));
  });
  if (definitions.childElementCount > 0) root.appendChild(definitions);

  const reference = document.createElementNS(SVG_NS, "g");
  reference.setAttribute("id", "REFERENCE_OUTLINE_DELETE_BEFORE_MAKING");

  const cut = document.createElementNS(SVG_NS, "g");
  cut.setAttribute("id", "CUT");
  const score = document.createElementNS(SVG_NS, "g");
  score.setAttribute("id", "SCORE");

  const copyTransforms: Array<string | undefined> = [undefined];
  clone.querySelectorAll<SVGUseElement>("use").forEach((use) => {
    copyTransforms.push(useTransform(use));
  });

  copyTransforms.forEach((transform) => {
    const referenceCopy = transformedCopy(transform);
    baseCopy.querySelectorAll<SVGElement>('.cut-shape, [data-export-layer="cut-lines"] .cut-line:not([data-export-layer="cricut-internal-cut"])').forEach((node) => {
      const copied = node.cloneNode(true) as SVGElement;
      copied.style.removeProperty("display");
      copied.style.setProperty("stroke", "#ff00ff");
      copied.style.setProperty("stroke-opacity", "0.65");
      referenceCopy.appendChild(copied);
    });
    if (referenceCopy.childElementCount > 0) reference.appendChild(referenceCopy);

    const cutCopy = transformedCopy(transform);
    baseCopy.querySelectorAll<SVGElement>('[data-export-layer="cricut-internal-cut"]').forEach((node) => {
      const copied = node.cloneNode(true) as SVGElement;
      copied.removeAttribute("data-export-layer");
      copied.style.removeProperty("display");
      cutCopy.appendChild(copied);
    });
    if (cutCopy.childElementCount > 0) cut.appendChild(cutCopy);

    const scoreCopy = transformedCopy(transform);
    baseCopy.querySelectorAll<SVGElement>('[data-export-layer="fold-lines"] .fold-line').forEach((node) => {
      const copied = node.cloneNode(true) as SVGElement;
      copied.style.removeProperty("display");
      copied.style.setProperty("stroke-dasharray", "none");
      scoreCopy.appendChild(copied);
    });
    if (scoreCopy.childElementCount > 0) score.appendChild(scoreCopy);
  });

  root.append(reference, cut, score);
  return root;
}

function measureSvg(svg: SVGSVGElement): SvgBounds {
  document.body.appendChild(svg);
  svg.style.position = "fixed";
  svg.style.left = "-10000px";
  svg.style.top = "0";
  try {
    const bounds = svg.getBBox();
    if (!(bounds.width > 0) || !(bounds.height > 0)) {
      throw new Error("The Cricut package has no printable geometry.");
    }
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  } finally {
    svg.remove();
    svg.style.removeProperty("position");
    svg.style.removeProperty("left");
    svg.style.removeProperty("top");
  }
}

function applyBounds(svg: SVGSVGElement, bounds: SvgBounds): void {
  svg.setAttribute("viewBox", `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  svg.setAttribute("width", `${bounds.width}mm`);
  svg.setAttribute("height", `${bounds.height}mm`);
}

function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The Cricut print image could not be encoded."));
    }, "image/png");
  });
}

async function rasterizeSvg(svg: SVGSVGElement, bounds: SvgBounds): Promise<Blob> {
  const pixelWidth = Math.max(1, Math.round((bounds.width / 25.4) * CRICUT_RASTER_DPI));
  const pixelHeight = Math.max(1, Math.round((bounds.height / 25.4) * CRICUT_RASTER_DPI));
  const rasterSource = svg.cloneNode(true) as SVGSVGElement;
  rasterSource.setAttribute("width", String(pixelWidth));
  rasterSource.setAttribute("height", String(pixelHeight));
  const serialized = new XMLSerializer().serializeToString(rasterSource);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await imageFromUrl(url);
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for the Cricut print image.");
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    return await canvasPng(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cricutInstructions(): string {
  return `CRICUT DESIGN SPACE WORKFLOW
1. Extract this ZIP file.
2. Upload tuckbox-print.png as a Flat Graphic / Print Then Cut image.
3. Upload tuckbox-cut-score.svg as a Vector image.
4. Add both uploads to the same Design Space canvas.
5. Select the SVG and note the width and height displayed by Design Space. Apply those same dimensions to the PNG with its aspect ratio locked.
6. Select both items and use Align > Center.
7. Ungroup the SVG if needed. It contains:
   - REFERENCE_OUTLINE_DELETE_BEFORE_MAKING
   - CUT
   - SCORE
8. Set CUT to Basic Cut.
9. Set SCORE to Score. If you do not have a scoring tool, hide SCORE and score the folds by hand.
10. Delete or hide REFERENCE_OUTLINE_DELETE_BEFORE_MAKING. It is only present to show the complete dieline and preserve alignment during import.
11. Select the print image, CUT, and SCORE layers and choose Attach so Design Space preserves their positions.
12. Choose Make and complete printing and cutting in the same Design Space session.
13. Print from Design Space at its default 100% size. Do not print the PDF separately.
14. Place the printed sheet on the mat when prompted. Cricut will scan its sensor marks before cutting.

NOTES
- Leave Print Then Cut bleed enabled unless you have a specific reason to disable it.
- Calibrate Print Then Cut in Design Space if cuts remain consistently offset.

OFFICIAL CRICUT DOCUMENTATION
https://help.cricut.com/hc/en-us/articles/360009387274-How-to-Print-Then-Cut-in-Design-Space
`;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to rasterize SVG for PDF export."));
  });
  image.src = url;
  return loaded;
}

async function addRasterizedSvgToPdf(
  pdf: InstanceType<typeof import("jspdf").jsPDF>,
  svg: SVGSVGElement,
  paper: Paper
): Promise<void> {
  const serialized = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([serialized], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await imageFromUrl(url);
    const scale = Math.max(2, Math.ceil(window.devicePixelRatio || 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(paper.width * scale);
    canvas.height = Math.round(paper.height * scale);

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for PDF export.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, paper.width, paper.height);
  } finally {
    URL.revokeObjectURL(url);
  }
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

export async function downloadCricutPackage(
  source: SVGSVGElement,
  filename = "tuckbox-cricut-package.zip"
): Promise<void> {
  const printSvg = cleanCricutPrintClone(source);
  const bounds = measureSvg(printSvg);
  applyBounds(printSvg, bounds);

  const [printPng, operationsSvg] = await Promise.all([
    rasterizeSvg(printSvg, bounds),
    Promise.resolve(
      new XMLSerializer().serializeToString(createCricutOperationsClone(source, bounds))
    )
  ]);
  const printBytes = new Uint8Array(await printPng.arrayBuffer());
  const archive = zipSync(
    {
      "tuckbox-print.png": printBytes,
      "tuckbox-cut-score.svg": strToU8(operationsSvg),
      "cricut-instructions.txt": strToU8(cricutInstructions())
    },
    { level: 6 }
  );
  download(new Blob([archive], { type: "application/zip" }), filename);
}

export async function downloadPdf(
  source: SVGSVGElement,
  paper: Paper,
  includeBleedGuides: boolean,
  filename = "tuckbox-template.pdf"
) {
  const [{ jsPDF }] = await Promise.all([import("jspdf"), import("svg2pdf.js")]);
  const clone = exportClone(source, includeBleedGuides, "artwork");
  flattenUseReferences(clone);
  document.body.appendChild(clone);
  clone.style.position = "fixed";
  clone.style.left = "-10000px";

  try {
    const createPdf = () => new jsPDF({
      orientation: paper.orientation === "portrait" ? "p" : "l",
      unit: "mm",
      format: [paper.width, paper.height],
      compress: true
    });
    let pdf = createPdf();

    try {
      await pdf.svg(clone, { x: 0, y: 0, width: paper.width, height: paper.height });
    } catch (error) {
      console.warn("Vector PDF export failed; falling back to rasterized SVG.", error);
      pdf = createPdf();
      await addRasterizedSvgToPdf(pdf, clone, paper);
    }

    pdf.save(filename);
  } finally {
    clone.remove();
  }
}
