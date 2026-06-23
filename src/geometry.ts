import type {
  BoxDimensions,
  BottomClosure,
  DielineGeometry,
  Orientation,
  Paper,
  PaperSize,
  Rect,
  ResolvedOrientation,
  Unit
} from "./types";

export const BLEED_MM = 3;
export const SAFE_MARGIN_MM = 6.35;
export const MAX_FLAP_MM = 19.05;
export const MAX_GLUE_TAB_MM = 17.78;

const PAPER_SIZES: Record<PaperSize, { width: number; height: number; name: string }> = {
  letter: { width: 215.9, height: 279.4, name: "US Letter" },
  a4: { width: 210, height: 297, name: "A4" }
};

export function toMillimeters(value: number, unit: Unit): number {
  return unit === "in" ? value * 25.4 : value;
}

export function fromMillimeters(value: number, unit: Unit): number {
  return unit === "in" ? value / 25.4 : value;
}

export function calculateDieline(
  dimensions: BoxDimensions,
  bottomClosure: BottomClosure = "tuck",
  glueTabOverride?: number
): Omit<DielineGeometry, "pageX" | "pageY"> {
  const { width: w, depth: d, height: h } = dimensions;
  const automaticGlueTab = Math.min(d * 0.95, MAX_GLUE_TAB_MM);
  const glueTab =
    glueTabOverride !== undefined && Number.isFinite(glueTabOverride) && glueTabOverride > 0
      ? glueTabOverride
      : automaticGlueTab;
  const tuckLip = Math.min(MAX_FLAP_MM, Math.max(9, d * 0.9));
  const topFlapDepth = d + tuckLip;
  const bottomFlapDepth = bottomClosure === "tuck" ? d + tuckLip : d;
  const flapDepth = topFlapDepth;
  const bodyY = topFlapDepth;

  const back: Rect = { x: glueTab, y: bodyY, width: w, height: h };
  const left: Rect = { x: glueTab + w, y: bodyY, width: d, height: h };
  const front: Rect = { x: glueTab + w + d, y: bodyY, width: w, height: h };
  const right: Rect = { x: glueTab + 2 * w + d, y: bodyY, width: d, height: h };

  return {
    totalWidth: 2 * w + 2 * d + glueTab,
    totalHeight: h + topFlapDepth + bottomFlapDepth,
    bodyY,
    glueTab,
    flapDepth,
    tuckLip,
    panels: { back, left, front, right },
    top: { x: glueTab, y: tuckLip, width: w, height: d },
    bottom: { x: glueTab, y: bodyY + h, width: w, height: d },
    bottomUnderFlap:
      bottomClosure === "glued"
        ? { x: glueTab + w + d, y: bodyY + h, width: w, height: d * 0.72 }
        : undefined,
    bottomClosure
  };
}

export function getPaper(
  size: PaperSize,
  orientation: ResolvedOrientation
): Paper {
  const base = PAPER_SIZES[size];
  const portrait = orientation === "portrait";
  return {
    width: portrait ? base.width : base.height,
    height: portrait ? base.height : base.width,
    name: base.name,
    orientation
  };
}

export function fitsOnPaper(
  dielineWidth: number,
  dielineHeight: number,
  paper: Paper,
  margin = SAFE_MARGIN_MM,
  bleed = BLEED_MM
): boolean {
  return (
    dielineWidth + bleed * 2 <= paper.width - margin * 2 &&
    dielineHeight + bleed * 2 <= paper.height - margin * 2
  );
}

export function resolvePaper(
  size: PaperSize,
  orientation: Orientation,
  dielineWidth: number,
  dielineHeight: number
): Paper {
  if (orientation !== "auto") {
    return getPaper(size, orientation);
  }

  const candidates = [getPaper(size, "portrait"), getPaper(size, "landscape")];
  const fitting = candidates.find((paper) => fitsOnPaper(dielineWidth, dielineHeight, paper));
  if (fitting) return fitting;

  return candidates.reduce((best, current) => {
    const bestOverflow =
      Math.max(0, dielineWidth - (best.width - SAFE_MARGIN_MM * 2)) +
      Math.max(0, dielineHeight - (best.height - SAFE_MARGIN_MM * 2));
    const currentOverflow =
      Math.max(0, dielineWidth - (current.width - SAFE_MARGIN_MM * 2)) +
      Math.max(0, dielineHeight - (current.height - SAFE_MARGIN_MM * 2));
    return currentOverflow < bestOverflow ? current : best;
  });
}

export function geometryForPage(
  dimensions: BoxDimensions,
  paper: Paper,
  bottomClosure: BottomClosure = "tuck",
  glueTabOverride?: number
): DielineGeometry {
  const geometry = calculateDieline(dimensions, bottomClosure, glueTabOverride);
  return {
    ...geometry,
    pageX: (paper.width - geometry.totalWidth) / 2,
    pageY: (paper.height - geometry.totalHeight) / 2
  };
}
