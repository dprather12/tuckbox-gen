import { useEffect, useMemo, useRef, useState } from "react";
import { ArtworkControl } from "./components/ArtworkControl";
import { AssembledBoxPreview } from "./components/AssembledBoxPreview";
import { DielinePreview } from "./components/DielinePreview";
import {
  BLEED_MM,
  SAFE_MARGIN_MM,
  calculateDieline,
  fitsOnPaper,
  geometriesForPage,
  resolvePaper,
  scaleDielineGeometry,
  fromMillimeters,
  toMillimeters
} from "./geometry";
import { downloadPdf, downloadSvg } from "./export";
import { trackEvent } from "./analytics";
import { loadPreferences, savePreferences } from "./preferences";
import type {
  ArtworkMap,
  ArtworkSettings,
  BottomClosure,
  BoxDimensions,
  DimensionCalculatorSettings,
  FaceContentMode,
  FaceModeMap,
  FaceName,
  FaceOpacityMap,
  Orientation,
  PaperDimensions,
  PaperSize,
  TextMap,
  TextSettings,
  Unit
} from "./types";

const faces: FaceName[] = ["front", "back", "left", "right", "top", "bottom"];
const INTERNAL_PRINT_BASELINE = 1.05;
const faceLabels: Record<FaceName, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
  top: "Top",
  bottom: "Bottom"
};

export default function App() {
  const [initialPreferences] = useState(loadPreferences);
  const [unit, setUnit] = useState<Unit>(initialPreferences.unit);
  const [dimensions, setDimensions] = useState<BoxDimensions>(initialPreferences.dimensions);
  const [dimensionCalculator, setDimensionCalculator] = useState<DimensionCalculatorSettings>(
    initialPreferences.dimensionCalculator
  );
  const [paperSize, setPaperSize] = useState<PaperSize>(initialPreferences.paperSize);
  const [customPaperDimensions, setCustomPaperDimensions] = useState<PaperDimensions>(
    initialPreferences.customPaperDimensions
  );
  const [orientation, setOrientation] = useState<Orientation>(initialPreferences.orientation);
  const [printPercentage, setPrintPercentage] = useState(initialPreferences.printPercentage);
  const [bottomClosure, setBottomClosure] = useState<BottomClosure>(initialPreferences.bottomClosure);
  const [manualGlueTab, setManualGlueTab] = useState(initialPreferences.manualGlueTab);
  const [glueTabWidth, setGlueTabWidth] = useState(initialPreferences.glueTabWidth);
  const [colorFlaps, setColorFlaps] = useState(initialPreferences.colorFlaps);
  const [showPrintLines, setShowPrintLines] = useState(initialPreferences.showPrintLines);
  const [showThumbNotch, setShowThumbNotch] = useState(initialPreferences.showThumbNotch);
  const [fillPage, setFillPage] = useState(initialPreferences.fillPage);
  const [showMoreSettings, setShowMoreSettings] = useState(initialPreferences.showMoreSettings);
  const [showOpacitySettings, setShowOpacitySettings] = useState(false);
  const [showGlueTabSettings, setShowGlueTabSettings] = useState(false);
  const [masterOpacity, setMasterOpacity] = useState(initialPreferences.masterOpacity);
  const [faceOpacities, setFaceOpacities] = useState<FaceOpacityMap>(
    initialPreferences.faceOpacities
  );
  const [showDimensionCalculator, setShowDimensionCalculator] = useState(false);
  const [artwork, setArtwork] = useState<ArtworkMap>({});
  const [faceModes, setFaceModes] = useState<FaceModeMap>(initialPreferences.faceModes);
  const [faceText, setFaceText] = useState<TextMap>({});
  const [useWrapArtwork, setUseWrapArtwork] = useState(initialPreferences.useWrapArtwork);
  const [wrapArtwork, setWrapArtwork] = useState<ArtworkSettings>();
  const [exporting, setExporting] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    savePreferences({
      unit,
      dimensions,
      dimensionCalculator,
      paperSize,
      customPaperDimensions,
      orientation,
      printPercentage,
      bottomClosure,
      manualGlueTab,
      glueTabWidth,
      colorFlaps,
      showPrintLines,
      showThumbNotch,
      fillPage,
      showMoreSettings,
      useWrapArtwork,
      faceModes,
      masterOpacity,
      faceOpacities
    });
  }, [
    unit,
    dimensions,
    dimensionCalculator,
    paperSize,
    customPaperDimensions,
    orientation,
    printPercentage,
    bottomClosure,
    manualGlueTab,
    glueTabWidth,
    colorFlaps,
    showPrintLines,
    showThumbNotch,
    fillPage,
    showMoreSettings,
    useWrapArtwork,
    faceModes,
    masterOpacity,
    faceOpacities
  ]);

  const dimensionsMm = useMemo(
    () => ({
      width: toMillimeters(dimensions.width, unit),
      depth: toMillimeters(dimensions.depth, unit),
      height: toMillimeters(dimensions.height, unit)
    }),
    [dimensions, unit]
  );
  const calculatedDimensionsMm = useMemo(() => {
    const sleeveThicknessMm = dimensionCalculator.sleeved
      ? (dimensionCalculator.sleeveMicrons / 1000) * 2
      : 0;
    const depth =
      dimensionCalculator.cardCount *
        (dimensionCalculator.cardThickness + sleeveThicknessMm) +
      dimensionCalculator.paddingDepth;

    return {
      width: dimensionCalculator.cardWidth + dimensionCalculator.paddingWidth,
      depth,
      height: dimensionCalculator.cardHeight + dimensionCalculator.paddingHeight
    };
  }, [dimensionCalculator]);
  const rawGeometry = useMemo(
    () =>
      calculateDieline(
        dimensionsMm,
        bottomClosure,
        manualGlueTab ? toMillimeters(glueTabWidth, unit) : undefined
      ),
    [dimensionsMm, bottomClosure, manualGlueTab, glueTabWidth, unit]
  );
  const printPercentageValid =
    Number.isFinite(printPercentage) &&
    printPercentage >= 25 &&
    printPercentage <= 200;
  const effectivePrintScale =
    INTERNAL_PRINT_BASELINE * (printPercentageValid ? printPercentage : 100) / 100;
  const printGeometry = useMemo(
    () => scaleDielineGeometry(rawGeometry, effectivePrintScale),
    [rawGeometry, effectivePrintScale]
  );
  const paper = useMemo(
    () =>
      resolvePaper(
        paperSize,
        orientation,
        printGeometry.totalWidth,
        printGeometry.totalHeight,
        fillPage,
        customPaperDimensions
      ),
    [paperSize, orientation, printGeometry, fillPage, customPaperDimensions]
  );
  const geometries = useMemo(
    () =>
      geometriesForPage(
        dimensionsMm,
        paper,
        fillPage,
        bottomClosure,
        manualGlueTab ? toMillimeters(glueTabWidth, unit) : undefined,
        effectivePrintScale
      ),
    [
      dimensionsMm,
      paper,
      fillPage,
      bottomClosure,
      manualGlueTab,
      glueTabWidth,
      unit,
      effectivePrintScale
    ]
  );
  const geometry = geometries[0];
  const displayedGlueTabWidth = manualGlueTab
    ? glueTabWidth
    : fromMillimeters(rawGeometry.glueTab, unit);
  const displayedGlueTabValue = Number(
    displayedGlueTabWidth.toFixed(unit === "in" ? 2 : 1)
  );
  const glueTabInputWidth = `calc(${String(displayedGlueTabValue).length}ch + 5.5rem)`;
  const glueTabSliderMax = Math.max(
    unit === "in" ? 2 : 50,
    dimensions.depth * 2,
    displayedGlueTabWidth
  );
  const dimensionsValid = Object.values(dimensionsMm).every(
    (value) => Number.isFinite(value) && value > 0
  );
  const calculatorValid =
    dimensionCalculator.cardWidth > 0 &&
    dimensionCalculator.cardHeight > 0 &&
    dimensionCalculator.cardThickness > 0 &&
    dimensionCalculator.cardCount > 0 &&
    Number.isFinite(dimensionCalculator.paddingWidth) &&
    dimensionCalculator.paddingWidth >= 0 &&
    Number.isFinite(dimensionCalculator.paddingDepth) &&
    dimensionCalculator.paddingDepth >= 0 &&
    Number.isFinite(dimensionCalculator.paddingHeight) &&
    dimensionCalculator.paddingHeight >= 0 &&
    (!dimensionCalculator.sleeved || dimensionCalculator.sleeveMicrons > 0);
  const paperDimensionsValid =
    paperSize !== "custom" ||
    Object.values(customPaperDimensions).every(
      (value) => Number.isFinite(value) && value > 0
    );
  const fits =
    dimensionsValid &&
    paperDimensionsValid &&
    printPercentageValid &&
    fitsOnPaper(printGeometry.totalWidth, printGeometry.totalHeight, paper);
  const requiredWidth = printGeometry.totalWidth + BLEED_MM * 2 + SAFE_MARGIN_MM * 2;
  const requiredHeight = printGeometry.totalHeight + BLEED_MM * 2 + SAFE_MARGIN_MM * 2;
  const calculatorCardLabel = dimensionCalculator.sleeved ? "Sleeved card" : "Card";

  const setDimension = (key: keyof BoxDimensions, value: string) => {
    setDimensions((current) => ({ ...current, [key]: Number(value) }));
  };

  const lengthInputValue = (valueMm: number) =>
    Number(fromMillimeters(valueMm, unit).toFixed(unit === "in" ? 3 : 1));

  const setCalculatorLength = (
    key: "cardWidth" | "cardHeight" | "cardThickness" | "paddingWidth" | "paddingDepth" | "paddingHeight",
    value: string
  ) => {
    setDimensionCalculator((current) => ({
      ...current,
      [key]: toMillimeters(Number(value), unit)
    }));
  };

  const setCalculatorNumber = (
    key: "cardCount" | "sleeveMicrons",
    value: string
  ) => {
    setDimensionCalculator((current) => ({
      ...current,
      [key]: Number(value)
    }));
  };

  const applyCalculatedDimensions = () => {
    const precision = unit === "in" ? 3 : 1;
    const round = (value: number) =>
      Number(fromMillimeters(value, unit).toFixed(precision));

    setDimensions({
      width: round(calculatedDimensionsMm.width),
      depth: round(calculatedDimensionsMm.depth),
      height: round(calculatedDimensionsMm.height)
    });
  };

  const setCustomPaperDimension = (key: keyof PaperDimensions, value: string) => {
    setCustomPaperDimensions((current) => ({
      ...current,
      [key]: toMillimeters(Number(value), unit)
    }));
  };

  const clampOpacity = (value: number) =>
    Math.min(100, Math.max(0, Number.isFinite(value) ? value : 100));

  const updateMasterOpacity = (value: string) => {
    setMasterOpacity(clampOpacity(Number(value)));
  };

  const updateFaceOpacity = (face: FaceName, value: string) => {
    setFaceOpacities((current) => ({
      ...current,
      [face]: clampOpacity(Number(value))
    }));
  };

  const updateArtwork = (face: FaceName, next?: ArtworkSettings) => {
    const previous = artwork[face];
    if (next?.src && next.src !== previous?.src) {
      trackEvent("artwork_upload", {
        face,
        file_type: next.src.slice(5, next.src.indexOf(";")) || "unknown"
      });
    } else if (!next && previous) {
      trackEvent("artwork_remove", { face });
    }

    setArtwork((current) => {
      const copy = { ...current };
      if (next) copy[face] = next;
      else delete copy[face];
      return copy;
    });
  };

  const updateWrapArtwork = (_face: FaceName | "wrap", next?: ArtworkSettings) => {
    if (next?.src && next.src !== wrapArtwork?.src) {
      trackEvent("artwork_upload", { face: "wrap", file_type: next.src.slice(5, next.src.indexOf(";")) || "unknown" });
    } else if (!next && wrapArtwork) {
      trackEvent("artwork_remove", { face: "wrap" });
    }
    setWrapArtwork(next);
  };

  const updateArtworkPosition = (
    target: FaceName | "wrap",
    offsetX: number,
    offsetY: number
  ) => {
    if (target === "wrap") {
      setWrapArtwork((current) =>
        current ? { ...current, offsetX, offsetY } : current
      );
      return;
    }
    setArtwork((current) => {
      const settings = current[target];
      return settings
        ? { ...current, [target]: { ...settings, offsetX, offsetY } }
        : current;
    });
  };

  const updateFaceMode = (face: FaceName, mode: FaceContentMode) => {
    setFaceModes((current) => ({ ...current, [face]: mode }));
  };

  const updateFaceText = (face: FaceName, next?: TextSettings) => {
    setFaceText((current) => {
      const copy = { ...current };
      if (next) copy[face] = next;
      else delete copy[face];
      return copy;
    });
  };

  const hasAnyPanelContent =
    Object.keys(artwork).length > 0 ||
    Object.keys(faceText).length > 0 ||
    Boolean(wrapArtwork);

  const clearAllPanelContent = () => {
    setArtwork({});
    setFaceText({});
    setWrapArtwork(undefined);
    trackEvent("artwork_clear_all", {
      image_faces: Object.keys(artwork).length + (wrapArtwork ? 1 : 0),
      text_faces: Object.keys(faceText).length
    });
  };

  const decoratedFaceCount =
    faces.filter((face) =>
      (faceModes[face] ?? "image") === "text"
        ? Boolean(faceText[face]?.content.trim())
        : Boolean(artwork[face])
    ).length + (useWrapArtwork && wrapArtwork ? 1 : 0);

  const handlePdf = async () => {
    if (!svgRef.current || !fits) return;
    setExporting(true);
    try {
      await downloadPdf(svgRef.current, paper, false);
      trackEvent("template_download", {
        format: "pdf",
        paper: paper.name,
        orientation: paper.orientation,
        copies_per_sheet: geometries.length,
        print_percentage: printPercentage,
        artwork_faces: decoratedFaceCount
      });
    } catch (error) {
      console.error(error);
      window.alert("The PDF could not be generated. Try downloading the SVG instead.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main>
      <header className="hero">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="eyebrow">Print · Cut · Fold</p>
          <h1>Tuckbox Studio</h1>
        </div>
      </header>

      <div className="workspace">
        <aside className="controls">
          <section className="control-section">
            <div className="section-heading">
              <div>
                <h2>Box dimensions</h2>
              </div>
            </div>

            <div className="segmented">
              <button className={unit === "in" ? "active" : ""} onClick={() => setUnit("in")} type="button">
                Inches
              </button>
              <button className={unit === "mm" ? "active" : ""} onClick={() => setUnit("mm")} type="button">
                Millimeters
              </button>
            </div>

            <div className="dimension-entry-row">
              <div className="dimension-grid">
                {([
                  ["width", "Width", "Front face"],
                  ["depth", "Depth", "Side face"],
                  ["height", "Height", "Vertical"]
                ] as const).map(([key, label, hint]) => (
                  <label key={key} className="field">
                    <span>{label}<small>{hint}</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="0.01"
                        step={unit === "in" ? "0.05" : "1"}
                        value={dimensions[key]}
                        onChange={(event) => setDimension(key, event.target.value)}
                      />
                      <b>{unit}</b>
                    </div>
                  </label>
                ))}
              </div>
              <button
                className="dimension-calculator-toggle"
                type="button"
                aria-expanded={showDimensionCalculator}
                onClick={() => setShowDimensionCalculator((current) => !current)}
              >
                Estimate from cards
              </button>
            </div>

            {showDimensionCalculator && (
              <div className="calculator-panel">
                <div className="calculator-heading">
                  <div>
                    <h3>Estimate from cards</h3>
                    <p>
                      Best approximation only. Sleeve fit, cardstock compression and printer
                      variance can change the finished box.
                    </p>
                  </div>
                </div>

                <label className="sleeved-toggle">
                  <input
                    type="checkbox"
                    checked={dimensionCalculator.sleeved}
                    onChange={(event) =>
                      setDimensionCalculator((current) => ({
                        ...current,
                        sleeved: event.target.checked
                      }))
                    }
                  />
                  Sleeved cards
                </label>

                <div className="calculator-grid">
                  <label className="field">
                    <span>{calculatorCardLabel} width<small>Front face</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="0.01"
                        step={unit === "in" ? "0.001" : "0.1"}
                        value={lengthInputValue(dimensionCalculator.cardWidth)}
                        onChange={(event) => setCalculatorLength("cardWidth", event.target.value)}
                      />
                      <b>{unit}</b>
                    </div>
                  </label>
                  <label className="field">
                    <span>{calculatorCardLabel} height<small>Vertical</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="0.01"
                        step={unit === "in" ? "0.001" : "0.1"}
                        value={lengthInputValue(dimensionCalculator.cardHeight)}
                        onChange={(event) => setCalculatorLength("cardHeight", event.target.value)}
                      />
                      <b>{unit}</b>
                    </div>
                  </label>
                  <label className="field">
                    <span>Card thickness<small>Per card</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="0.01"
                        step={unit === "in" ? "0.001" : "0.01"}
                        value={lengthInputValue(dimensionCalculator.cardThickness)}
                        onChange={(event) => setCalculatorLength("cardThickness", event.target.value)}
                      />
                      <b>{unit}</b>
                    </div>
                  </label>
                  <label className="field">
                    <span>Cards<small>Count</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={dimensionCalculator.cardCount}
                        onChange={(event) => setCalculatorNumber("cardCount", event.target.value)}
                      />
                      <b>ct</b>
                    </div>
                  </label>
                </div>

                {dimensionCalculator.sleeved && (
                  <label className="field sleeve-micron-field">
                    <span>Sleeve thickness<small>Microns, per side</small></span>
                    <div className="number-input">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={dimensionCalculator.sleeveMicrons}
                        onChange={(event) => setCalculatorNumber("sleeveMicrons", event.target.value)}
                      />
                      <b>microns</b>
                    </div>
                  </label>
                )}

                <div className="extra-padding-section">
                  <h4>Extra padding</h4>
                  <div className="padding-grid">
                    {([
                      ["paddingWidth", "Width"],
                      ["paddingDepth", "Depth"],
                      ["paddingHeight", "Height"]
                    ] as const).map(([key, label]) => (
                      <label className="field" key={key}>
                        <span>{label}</span>
                        <div className="number-input">
                          <input
                            type="number"
                            min="0"
                            step={unit === "in" ? "0.001" : "0.1"}
                            value={lengthInputValue(dimensionCalculator[key])}
                            onChange={(event) => setCalculatorLength(key, event.target.value)}
                          />
                          <b>{unit}</b>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="calculator-result">
                  <span>
                    Estimated box: {fromMillimeters(calculatedDimensionsMm.width, unit).toFixed(unit === "in" ? 3 : 1)} x{" "}
                    {fromMillimeters(calculatedDimensionsMm.depth, unit).toFixed(unit === "in" ? 3 : 1)} x{" "}
                    {fromMillimeters(calculatedDimensionsMm.height, unit).toFixed(unit === "in" ? 3 : 1)} {unit}
                  </span>
                  <button type="button" onClick={applyCalculatedDimensions} disabled={!calculatorValid}>
                    Use estimate
                  </button>
                </div>
              </div>
            )}
            <label className="field closure-field">
              <span>Bottom closure</span>
              <div className="segmented compact">
                <button
                  className={bottomClosure === "tuck" ? "active" : ""}
                  type="button"
                  onClick={() => setBottomClosure("tuck")}
                >
                  Openable tuck
                </button>
                <button
                  className={bottomClosure === "glued" ? "active" : ""}
                  type="button"
                  onClick={() => setBottomClosure("glued")}
                >
                  Glued closed
                </button>
              </div>
            </label>
          </section>

          <section className="control-section artwork-section">
            <div className="section-heading">
              <div>
                <h2>Panel artwork</h2>
              </div>
              <button
                className="clear-all-button"
                type="button"
                disabled={!hasAnyPanelContent}
                onClick={clearAllPanelContent}
              >
                Clear all
              </button>
            </div>
            <div className="more-settings">
              <button
                className="more-settings-button"
                type="button"
                aria-expanded={showMoreSettings}
                onClick={() => setShowMoreSettings((current) => !current)}
              >
                <span>More Settings</span>
                <span aria-hidden="true">{showMoreSettings ? "−" : "+"}</span>
              </button>
              {showMoreSettings && (
                <div className="more-settings-content">
                  <label>
                    <input
                      type="checkbox"
                      checked={useWrapArtwork}
                      onChange={(event) => setUseWrapArtwork(event.target.checked)}
                    />
                    Use a single image to wrap around the front, back and sides
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!colorFlaps}
                      onChange={(event) => setColorFlaps(!event.target.checked)}
                    />
                    Leave tabs and dust flaps white
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showPrintLines}
                      onChange={(event) => setShowPrintLines(event.target.checked)}
                    />
                    Show fold and cut lines
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showThumbNotch}
                      onChange={(event) => setShowThumbNotch(event.target.checked)}
                    />
                    Include front cutout notch
                  </label>
                  <button
                    className="nested-settings-button"
                    type="button"
                    aria-expanded={showOpacitySettings}
                    onClick={() => setShowOpacitySettings((current) => !current)}
                  >
                    <span>Set image opacity</span>
                    <span aria-hidden="true">{showOpacitySettings ? "−" : "+"}</span>
                  </button>
                  {showOpacitySettings && (
                    <div className="opacity-settings-panel">
                      <div className="opacity-settings-heading">
                        <span>Opacity</span>
                      </div>
                      <label className="field opacity-field">
                        <span>
                          Master opacity
                          <small>{masterOpacity}%</small>
                        </span>
                        <div className="opacity-slider">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="1"
                            value={masterOpacity}
                            onChange={(event) => updateMasterOpacity(event.target.value)}
                          />
                          <div className="number-input opacity-number">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={masterOpacity}
                              onChange={(event) => updateMasterOpacity(event.target.value)}
                              aria-label="Master opacity"
                            />
                            <b>%</b>
                          </div>
                        </div>
                      </label>
                      <div className="face-opacity-grid">
                        {faces.map((face) => {
                          const opacity = faceOpacities[face] ?? 100;
                          return (
                            <label className="field opacity-field" key={face}>
                              <span>
                                {faceLabels[face]}
                                <small>{opacity}%</small>
                              </span>
                              <div className="opacity-slider">
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  step="1"
                                  value={opacity}
                                  onChange={(event) => updateFaceOpacity(face, event.target.value)}
                                />
                                <div className="number-input opacity-number">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={opacity}
                                    onChange={(event) => updateFaceOpacity(face, event.target.value)}
                                    aria-label={`${faceLabels[face]} opacity`}
                                  />
                                  <b>%</b>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <button
                    className="nested-settings-button"
                    type="button"
                    aria-expanded={showGlueTabSettings}
                    onClick={() => setShowGlueTabSettings((current) => !current)}
                  >
                    <span>Glue flap width</span>
                    <span aria-hidden="true">{showGlueTabSettings ? "−" : "+"}</span>
                  </button>
                  {showGlueTabSettings && (
                    <div className="nested-settings-panel">
                      <div className="nested-settings-heading">
                        <span>
                          Glue flap width
                          <small>{manualGlueTab ? "Manual override" : "Automatic"}</small>
                        </span>
                      </div>
                      <div className="field glue-tab-field">
                        <label className="manual-glue-toggle">
                          <input
                            type="checkbox"
                            checked={manualGlueTab}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              if (checked) {
                                setGlueTabWidth(fromMillimeters(rawGeometry.glueTab, unit));
                              }
                              setManualGlueTab(checked);
                            }}
                          />
                          Set manually
                        </label>
                        <div className="glue-tab-slider">
                          <input
                            type="range"
                            min={unit === "in" ? 0.01 : 0.1}
                            max={glueTabSliderMax}
                            step={unit === "in" ? 0.01 : 0.1}
                            value={displayedGlueTabWidth}
                            disabled={!manualGlueTab}
                            onChange={(event) => setGlueTabWidth(Number(event.target.value))}
                            aria-label="Glue flap width"
                          />
                          <div className="number-input glue-tab-number" style={{ width: glueTabInputWidth }}>
                            <input
                              type="number"
                              min={unit === "in" ? 0.01 : 0.1}
                              step={unit === "in" ? 0.01 : 0.1}
                              value={displayedGlueTabValue}
                              disabled={!manualGlueTab}
                              onChange={(event) => setGlueTabWidth(Number(event.target.value))}
                            />
                            <b>{unit}</b>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="artwork-grid">
              {useWrapArtwork && (
                <ArtworkControl
                  face="wrap"
                  artwork={wrapArtwork}
                  onChange={updateWrapArtwork}
                  allowRepeat
                />
              )}
              {(useWrapArtwork ? (["top", "bottom"] as FaceName[]) : faces).map((face) => (
                <ArtworkControl
                  key={face}
                  face={face}
                  artwork={artwork[face]}
                  mode={faceModes[face] ?? "image"}
                  text={faceText[face]}
                  onModeChange={(mode) => updateFaceMode(face, mode)}
                  onTextChange={(next) => updateFaceText(face, next)}
                  onChange={(selectedFace, next) =>
                    updateArtwork(selectedFace as FaceName, next)
                  }
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="preview-column">
          <div className="preview-toolbar">
            <div>
              <h2>Print preview</h2>
            </div>
          </div>
          <div className="preview-options-row">
            <div className="preview-paper-controls">
              <label className="field">
                <span>Paper</span>
                <select value={paperSize} onChange={(event) => setPaperSize(event.target.value as PaperSize)}>
                  <option value="letter">US Letter</option>
                  <option value="a4">A4</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label
                className="field"
                title={
                  fillPage
                    ? "Set to auto to maximize copies"
                    : undefined
                }
              >
                <span>
                  Orientation
                  {fillPage ? <small>Best copy count</small> : null}
                </span>
                <select
                  value={fillPage ? "auto" : orientation}
                  disabled={fillPage}
                  onChange={(event) => setOrientation(event.target.value as Orientation)}
                >
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>
              {paperSize === "custom" && (
                <div className="custom-paper-dimensions">
                  {(["width", "height"] as const).map((key) => (
                    <label className="field" key={key}>
                      <span>{key === "width" ? "Width" : "Height"}</span>
                      <div className="number-input">
                        <input
                          type="number"
                          min="0.1"
                          step={unit === "in" ? "0.01" : "0.1"}
                          value={Number(
                            fromMillimeters(customPaperDimensions[key], unit).toFixed(
                              unit === "in" ? 2 : 1
                            )
                          )}
                          onChange={(event) => setCustomPaperDimension(key, event.target.value)}
                          aria-label={`Custom paper ${key}`}
                        />
                        <b>{unit}</b>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <label className="fill-page-option">
                <input
                  type="checkbox"
                  checked={fillPage}
                  onChange={(event) => setFillPage(event.target.checked)}
                />
                Fill sheet with as many copies as will fit
                {fillPage && fits ? <small>{geometries.length} per sheet</small> : null}
              </label>
            </div>
            {dimensionsValid && (
              <AssembledBoxPreview
                dimensions={dimensionsMm}
                artwork={artwork}
                faceModes={faceModes}
                faceText={faceText}
                showThumbNotch={showThumbNotch}
                useWrapArtwork={useWrapArtwork}
                wrapArtwork={useWrapArtwork ? wrapArtwork : undefined}
                masterOpacity={masterOpacity}
                faceOpacities={faceOpacities}
              />
            )}
          </div>
          {!dimensionsValid ? (
            <div className="status-card error">Enter positive values for all three box dimensions.</div>
          ) : !paperDimensionsValid ? (
            <div className="status-card error">Enter positive values for both custom paper dimensions.</div>
          ) : !printPercentageValid ? (
            <div className="status-card error">Enter a template size between 25% and 200%.</div>
          ) : !fits ? (
            <div className="status-card error">
              <strong>This box will not fit at the selected template size.</strong>
              <span>
                Required sheet area: {requiredWidth.toFixed(1)} × {requiredHeight.toFixed(1)} mm.
                Available paper: {paper.width.toFixed(1)} × {paper.height.toFixed(1)} mm.
              </span>
            </div>
          ) : null}

          <div className={`paper-stage ${paper.orientation}`}>
            <div className="paper-shadow">
              <DielinePreview
                ref={svgRef}
                paper={paper}
                geometry={geometry}
                copyGeometries={geometries.slice(1)}
                artwork={artwork}
                faceModes={faceModes}
                faceText={faceText}
                colorFlaps={colorFlaps}
                showPrintLines={showPrintLines}
                showThumbNotch={showThumbNotch}
                useWrapArtwork={useWrapArtwork}
                wrapArtwork={useWrapArtwork ? wrapArtwork : undefined}
                masterOpacity={masterOpacity}
                faceOpacities={faceOpacities}
                onArtworkPositionChange={updateArtworkPosition}
              />
            </div>
          </div>

          <section className="export-card">
            <p className="print-instruction">
              Print a test sheet first to check whether your printer needs a small scaling adjustment.
            </p>
            <div className="export-controls">
              <label className="print-percentage-field">
                <span>Scaling</span>
                <div className="print-percentage-input">
                  <input
                    type="number"
                    min="25"
                    max="200"
                    step="1"
                    value={printPercentage}
                    onChange={(event) => setPrintPercentage(Number(event.target.value))}
                  />
                  <b>%</b>
                </div>
              </label>
              <div className="export-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={!fits}
                  onClick={() => {
                    if (!svgRef.current) return;
                    downloadSvg(svgRef.current, false);
                    trackEvent("template_download", {
                      format: "svg",
                      paper: paper.name,
                      orientation: paper.orientation,
                      copies_per_sheet: geometries.length,
                      print_percentage: printPercentage,
                      artwork_faces: decoratedFaceCount
                    });
                  }}
                >
                  Download SVG
                </button>
                <button className="primary-button" type="button" disabled={!fits || exporting} onClick={handlePdf}>
                  {exporting ? "Building PDF…" : "Download PDF"}
                </button>
              </div>
              <a
                className="feedback-link"
                href="https://boardgamegeek.com/thread/3727288/a-web-app-for-creating-custom-tuckboxes-you-supply"
                target="_blank"
                rel="noopener noreferrer"
              >
                Feedback
              </a>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
