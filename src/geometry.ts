import type {
  BoxDimensions,
  BottomClosure,
  DielineGeometry,
  Orientation,
  Paper,
  PaperDimensions,
  PaperSize,
  Rect,
  ResolvedOrientation,
  Unit
} from "./types";

export const BLEED_MM = 3;
export const COPY_GAP_MM = 5;
export const SAFE_MARGIN_MM = 6.35;
export const MAX_FLAP_MM = 19.05;
export const MAX_GLUE_TAB_MM = 17.78;
const FIT_EPSILON_MM = 0.01;

const PAPER_SIZES: Record<Exclude<PaperSize, "custom">, { width: number; height: number; name: string }> = {
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
  glueTabOverride?: number,
  tuckLipOverride?: number
): Omit<DielineGeometry, "pageX" | "pageY"> {
  const { width: w, depth: d, height: h } = dimensions;
  const automaticGlueTab = Math.min(d * 0.95, MAX_GLUE_TAB_MM);
  const glueTab =
    glueTabOverride !== undefined && Number.isFinite(glueTabOverride) && glueTabOverride > 0
      ? glueTabOverride
      : automaticGlueTab;
  const automaticTuckLip = Math.min(MAX_FLAP_MM, Math.max(9, d * 0.9));
  const tuckLip =
    tuckLipOverride !== undefined && Number.isFinite(tuckLipOverride) && tuckLipOverride > 0
      ? tuckLipOverride
      : automaticTuckLip;
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

export function scaleDielineGeometry(
  geometry: Omit<DielineGeometry, "pageX" | "pageY">,
  scale: number
): Omit<DielineGeometry, "pageX" | "pageY"> {
  const scaleRect = (rect: Rect): Rect => ({
    x: rect.x * scale,
    y: rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale
  });

  return {
    ...geometry,
    totalWidth: geometry.totalWidth * scale,
    totalHeight: geometry.totalHeight * scale,
    bodyY: geometry.bodyY * scale,
    glueTab: geometry.glueTab * scale,
    flapDepth: geometry.flapDepth * scale,
    tuckLip: geometry.tuckLip * scale,
    panels: {
      back: scaleRect(geometry.panels.back),
      left: scaleRect(geometry.panels.left),
      front: scaleRect(geometry.panels.front),
      right: scaleRect(geometry.panels.right)
    },
    top: scaleRect(geometry.top),
    bottom: scaleRect(geometry.bottom),
    bottomUnderFlap: geometry.bottomUnderFlap
      ? scaleRect(geometry.bottomUnderFlap)
      : undefined
  };
}

export function getPaper(
  size: PaperSize,
  orientation: ResolvedOrientation,
  customDimensions?: PaperDimensions
): Paper {
  const base = size === "custom"
    ? {
        width: customDimensions?.width ?? PAPER_SIZES.letter.width,
        height: customDimensions?.height ?? PAPER_SIZES.letter.height,
        name: "Custom"
      }
    : PAPER_SIZES[size];
  const portrait = orientation === "portrait";
  const portraitWidth = Math.min(base.width, base.height);
  const portraitHeight = Math.max(base.width, base.height);
  return {
    width: portrait ? portraitWidth : portraitHeight,
    height: portrait ? portraitHeight : portraitWidth,
    name: base.name,
    orientation
  };
}

export function fitsOnPaper(
  dielineWidth: number,
  dielineHeight: number,
  paper: Paper,
  margin = 0,
  bleed = 0
): boolean {
  return (
    dielineWidth + bleed * 2 <= paper.width - margin * 2 + FIT_EPSILON_MM &&
    dielineHeight + bleed * 2 <= paper.height - margin * 2 + FIT_EPSILON_MM
  );
}

export function resolvePaper(
  size: PaperSize,
  orientation: Orientation,
  dielineWidth: number,
  dielineHeight: number,
  maximizeCopies = false,
  customDimensions?: PaperDimensions
): Paper {
  const portrait = getPaper(size, "portrait", customDimensions);
  const landscape = getPaper(size, "landscape", customDimensions);

  if (maximizeCopies || orientation === "auto") {
    const portraitCount = countDielinesOnPaper(dielineWidth, dielineHeight, portrait);
    const landscapeCount = countDielinesOnPaper(dielineWidth, dielineHeight, landscape);

    if (landscapeCount > portraitCount) return landscape;
    if (portraitCount > landscapeCount) return portrait;

    // Tied copy count: respect the user's orientation preference (landscape wins if auto)
    if (maximizeCopies) {
      return orientation === "portrait" ? portrait : landscape;
    }

    // "auto" with equal counts: prefer whichever fits by fitsOnPaper check (portrait first)
    const fitting = [portrait, landscape].find((p) => fitsOnPaper(dielineWidth, dielineHeight, p));
    if (fitting) return fitting;

    // Neither fits: return the one with least overflow
    return [portrait, landscape].reduce((best, current) => {
      const bestOverflow =
        Math.max(0, dielineWidth - best.width) +
        Math.max(0, dielineHeight - best.height);
      const currentOverflow =
        Math.max(0, dielineWidth - current.width) +
        Math.max(0, dielineHeight - current.height);
      return currentOverflow < bestOverflow ? current : best;
    });
  }

  return getPaper(size, orientation, customDimensions);
}

export function countDielinesOnPaper(
  dielineWidth: number,
  dielineHeight: number,
  paper: Paper,
  margin = 0,
  copyGap = COPY_GAP_MM
): number {
  const availableWidth = paper.width - margin * 2;
  const availableHeight = paper.height - margin * 2;
  const footprintWidth = dielineWidth + copyGap;
  const footprintHeight = dielineHeight + copyGap;

  if (
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    footprintWidth <= 0 ||
    footprintHeight <= 0
  ) {
    return 0;
  }

  return (
    Math.floor((availableWidth + copyGap + FIT_EPSILON_MM) / footprintWidth) *
    Math.floor((availableHeight + copyGap + FIT_EPSILON_MM) / footprintHeight)
  );
}

export function geometryForPage(
  dimensions: BoxDimensions,
  paper: Paper,
  bottomClosure: BottomClosure = "tuck",
  glueTabOverride?: number,
  tuckLipOverride?: number,
  scale = 1
): DielineGeometry {
  const geometry = scaleDielineGeometry(
    calculateDieline(dimensions, bottomClosure, glueTabOverride, tuckLipOverride),
    scale
  );
  return {
    ...geometry,
    pageX: (paper.width - geometry.totalWidth) / 2,
    pageY: (paper.height - geometry.totalHeight) / 2
  };
}

export function geometriesForPage(
  dimensions: BoxDimensions,
  paper: Paper,
  fillPage: boolean,
  bottomClosure: BottomClosure = "tuck",
  glueTabOverride?: number,
  tuckLipOverride?: number,
  scale = 1
): DielineGeometry[] {
  if (!fillPage) {
    return [geometryForPage(dimensions, paper, bottomClosure, glueTabOverride, tuckLipOverride, scale)];
  }

  const geometry = scaleDielineGeometry(
    calculateDieline(dimensions, bottomClosure, glueTabOverride, tuckLipOverride),
    scale
  );
  const footprintWidth = geometry.totalWidth + COPY_GAP_MM;
  const footprintHeight = geometry.totalHeight + COPY_GAP_MM;
  const columns = Math.floor(
    (paper.width + COPY_GAP_MM + FIT_EPSILON_MM) / footprintWidth
  );
  const rows = Math.floor(
    (paper.height + COPY_GAP_MM + FIT_EPSILON_MM) / footprintHeight
  );

  if (columns < 1 || rows < 1) {
    return [geometryForPage(dimensions, paper, bottomClosure, glueTabOverride, tuckLipOverride, scale)];
  }

  const layoutWidth = columns * geometry.totalWidth + (columns - 1) * COPY_GAP_MM;
  const layoutHeight = rows * geometry.totalHeight + (rows - 1) * COPY_GAP_MM;
  const startX = (paper.width - layoutWidth) / 2;
  const startY = (paper.height - layoutHeight) / 2;

  return Array.from({ length: rows * columns }, (_, index) => ({
    ...geometry,
    pageX: startX + (index % columns) * footprintWidth,
    pageY: startY + Math.floor(index / columns) * footprintHeight
  }));
}
