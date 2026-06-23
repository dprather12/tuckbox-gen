import type {
  BottomClosure,
  BoxDimensions,
  DimensionCalculatorSettings,
  FaceModeMap,
  Orientation,
  PaperDimensions,
  PaperSize,
  Unit
} from "./types";

const STORAGE_KEY = "tuckbox-studio-preferences-v1";

export interface Preferences {
  unit: Unit;
  dimensions: BoxDimensions;
  dimensionCalculator: DimensionCalculatorSettings;
  paperSize: PaperSize;
  customPaperDimensions: PaperDimensions;
  orientation: Orientation;
  printPercentage: number;
  bottomClosure: BottomClosure;
  manualGlueTab: boolean;
  glueTabWidth: number;
  colorFlaps: boolean;
  showPrintLines: boolean;
  showThumbNotch: boolean;
  fillPage: boolean;
  showMoreSettings: boolean;
  useWrapArtwork: boolean;
  faceModes: FaceModeMap;
}

export const DEFAULT_PREFERENCES: Preferences = {
  unit: "in",
  dimensions: {
    width: 2.5,
    depth: 0.75,
    height: 3.5
  },
  dimensionCalculator: {
    cardWidth: 63,
    cardHeight: 88,
    cardThickness: 0.305,
    cardCount: 60,
    sleeved: false,
    sleeveMicrons: 100,
    paddingWidth: 0,
    paddingDepth: 0,
    paddingHeight: 0
  },
  paperSize: "letter",
  customPaperDimensions: {
    width: 215.9,
    height: 279.4
  },
  orientation: "landscape",
  printPercentage: 100,
  bottomClosure: "glued",
  manualGlueTab: false,
  glueTabWidth: 0.6,
  colorFlaps: true,
  showPrintLines: true,
  showThumbNotch: true,
  fillPage: true,
  showMoreSettings: false,
  useWrapArtwork: false,
  faceModes: {}
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    const dimensions = stored.dimensions as Partial<BoxDimensions> | undefined;
    const dimensionCalculator = stored.dimensionCalculator as Partial<DimensionCalculatorSettings> | undefined;
    const customPaperDimensions = stored.customPaperDimensions as Partial<PaperDimensions> | undefined;
    const faceModes = stored.faceModes as Record<string, unknown> | undefined;

    return {
      unit: stored.unit === "mm" || stored.unit === "in" ? stored.unit : DEFAULT_PREFERENCES.unit,
      dimensions: {
        width: isPositiveNumber(dimensions?.width) ? dimensions.width : DEFAULT_PREFERENCES.dimensions.width,
        depth: isPositiveNumber(dimensions?.depth) ? dimensions.depth : DEFAULT_PREFERENCES.dimensions.depth,
        height: isPositiveNumber(dimensions?.height) ? dimensions.height : DEFAULT_PREFERENCES.dimensions.height
      },
      dimensionCalculator: {
        cardWidth: isPositiveNumber(dimensionCalculator?.cardWidth)
          ? dimensionCalculator.cardWidth
          : DEFAULT_PREFERENCES.dimensionCalculator.cardWidth,
        cardHeight: isPositiveNumber(dimensionCalculator?.cardHeight)
          ? dimensionCalculator.cardHeight
          : DEFAULT_PREFERENCES.dimensionCalculator.cardHeight,
        cardThickness: isPositiveNumber(dimensionCalculator?.cardThickness)
          ? dimensionCalculator.cardThickness
          : DEFAULT_PREFERENCES.dimensionCalculator.cardThickness,
        cardCount: isPositiveNumber(dimensionCalculator?.cardCount)
          ? Math.round(dimensionCalculator.cardCount)
          : DEFAULT_PREFERENCES.dimensionCalculator.cardCount,
        sleeved: typeof dimensionCalculator?.sleeved === "boolean"
          ? dimensionCalculator.sleeved
          : DEFAULT_PREFERENCES.dimensionCalculator.sleeved,
        sleeveMicrons: isPositiveNumber(dimensionCalculator?.sleeveMicrons)
          ? dimensionCalculator.sleeveMicrons
          : DEFAULT_PREFERENCES.dimensionCalculator.sleeveMicrons,
        paddingWidth: typeof dimensionCalculator?.paddingWidth === "number" && Number.isFinite(dimensionCalculator.paddingWidth)
          ? dimensionCalculator.paddingWidth
          : DEFAULT_PREFERENCES.dimensionCalculator.paddingWidth,
        paddingDepth: typeof dimensionCalculator?.paddingDepth === "number" && Number.isFinite(dimensionCalculator.paddingDepth)
          ? dimensionCalculator.paddingDepth
          : DEFAULT_PREFERENCES.dimensionCalculator.paddingDepth,
        paddingHeight: typeof dimensionCalculator?.paddingHeight === "number" && Number.isFinite(dimensionCalculator.paddingHeight)
          ? dimensionCalculator.paddingHeight
          : DEFAULT_PREFERENCES.dimensionCalculator.paddingHeight
      },
      paperSize: stored.paperSize === "a4" || stored.paperSize === "letter" || stored.paperSize === "custom"
        ? stored.paperSize
        : DEFAULT_PREFERENCES.paperSize,
      customPaperDimensions: {
        width: isPositiveNumber(customPaperDimensions?.width)
          ? customPaperDimensions.width
          : DEFAULT_PREFERENCES.customPaperDimensions.width,
        height: isPositiveNumber(customPaperDimensions?.height)
          ? customPaperDimensions.height
          : DEFAULT_PREFERENCES.customPaperDimensions.height
      },
      orientation:
        stored.orientation === "auto" ||
        stored.orientation === "portrait" ||
        stored.orientation === "landscape"
          ? stored.orientation
          : DEFAULT_PREFERENCES.orientation,
      printPercentage:
        isPositiveNumber(stored.printPercentage) &&
        stored.printPercentage >= 25 &&
        stored.printPercentage <= 200
          ? stored.printPercentage
          : DEFAULT_PREFERENCES.printPercentage,
      bottomClosure: stored.bottomClosure === "glued" || stored.bottomClosure === "tuck"
        ? stored.bottomClosure
        : DEFAULT_PREFERENCES.bottomClosure,
      manualGlueTab: DEFAULT_PREFERENCES.manualGlueTab,
      glueTabWidth: isPositiveNumber(stored.glueTabWidth)
        ? stored.glueTabWidth
        : DEFAULT_PREFERENCES.glueTabWidth,
      colorFlaps: typeof stored.colorFlaps === "boolean"
        ? stored.colorFlaps
        : DEFAULT_PREFERENCES.colorFlaps,
      showPrintLines: typeof stored.showPrintLines === "boolean"
        ? stored.showPrintLines
        : DEFAULT_PREFERENCES.showPrintLines,
      showThumbNotch: typeof stored.showThumbNotch === "boolean"
        ? stored.showThumbNotch
        : DEFAULT_PREFERENCES.showThumbNotch,
      fillPage: typeof stored.fillPage === "boolean"
        ? stored.fillPage
        : DEFAULT_PREFERENCES.fillPage,
      showMoreSettings: typeof stored.showMoreSettings === "boolean"
        ? stored.showMoreSettings
        : DEFAULT_PREFERENCES.showMoreSettings,
      useWrapArtwork: typeof stored.useWrapArtwork === "boolean"
        ? stored.useWrapArtwork
        : DEFAULT_PREFERENCES.useWrapArtwork,
      faceModes: Object.fromEntries(
        Object.entries(faceModes ?? {}).filter(
          ([face, mode]) =>
            ["front", "back", "left", "right", "top", "bottom"].includes(face) &&
            (mode === "image" || mode === "text")
        )
      ) as FaceModeMap
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing or storage limits should not prevent using the app.
  }
}
