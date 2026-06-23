import type {
  BottomClosure,
  BoxDimensions,
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
  paperSize: PaperSize;
  customPaperDimensions: PaperDimensions;
  orientation: Orientation;
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
  paperSize: "letter",
  customPaperDimensions: {
    width: 215.9,
    height: 279.4
  },
  orientation: "landscape",
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
    const customPaperDimensions = stored.customPaperDimensions as Partial<PaperDimensions> | undefined;
    const faceModes = stored.faceModes as Record<string, unknown> | undefined;

    return {
      unit: stored.unit === "mm" || stored.unit === "in" ? stored.unit : DEFAULT_PREFERENCES.unit,
      dimensions: {
        width: isPositiveNumber(dimensions?.width) ? dimensions.width : DEFAULT_PREFERENCES.dimensions.width,
        depth: isPositiveNumber(dimensions?.depth) ? dimensions.depth : DEFAULT_PREFERENCES.dimensions.depth,
        height: isPositiveNumber(dimensions?.height) ? dimensions.height : DEFAULT_PREFERENCES.dimensions.height
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
