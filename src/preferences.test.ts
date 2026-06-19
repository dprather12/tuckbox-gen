import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences
} from "./preferences";

describe("preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns defaults when no preferences have been saved", () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("persists non-content settings", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      unit: "mm" as const,
      dimensions: { width: 70, depth: 20, height: 95 },
      bottomClosure: "glued" as const,
      colorFlaps: false,
      showPrintLines: false,
      showThumbNotch: false,
      showMoreSettings: true,
      useWrapArtwork: true,
      faceModes: { front: "text" as const, back: "image" as const }
    };

    savePreferences(preferences);

    expect(loadPreferences()).toEqual(preferences);
  });

  it("falls back safely when stored values are invalid", () => {
    window.localStorage.setItem(
      "tuckbox-studio-preferences-v1",
      JSON.stringify({
        unit: "yards",
        dimensions: { width: -1, depth: "wide", height: 100 },
        faceModes: { front: "video", left: "text" }
      })
    );

    expect(loadPreferences()).toEqual({
      ...DEFAULT_PREFERENCES,
      dimensions: {
        ...DEFAULT_PREFERENCES.dimensions,
        height: 100
      },
      faceModes: { left: "text" }
    });
  });
});
