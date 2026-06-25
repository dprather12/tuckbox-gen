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
