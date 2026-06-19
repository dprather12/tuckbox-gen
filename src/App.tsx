import { useEffect, useMemo, useRef, useState } from "react";
import { ArtworkControl } from "./components/ArtworkControl";
import { AssembledBoxPreview } from "./components/AssembledBoxPreview";
import { DielinePreview } from "./components/DielinePreview";
import {
  BLEED_MM,
  SAFE_MARGIN_MM,
  calculateDieline,
  fitsOnPaper,
  geometryForPage,
  resolvePaper,
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
  FaceContentMode,
  FaceModeMap,
  FaceName,
  Orientation,
  PaperSize,
  TextMap,
  TextSettings,
  Unit
} from "./types";

const faces: FaceName[] = ["front", "back", "left", "right", "top", "bottom"];

export default function App() {
  const [initialPreferences] = useState(loadPreferences);
  const [unit, setUnit] = useState<Unit>(initialPreferences.unit);
  const [dimensions, setDimensions] = useState<BoxDimensions>(initialPreferences.dimensions);
  const [paperSize, setPaperSize] = useState<PaperSize>(initialPreferences.paperSize);
  const [orientation, setOrientation] = useState<Orientation>(initialPreferences.orientation);
  const [bottomClosure, setBottomClosure] = useState<BottomClosure>(initialPreferences.bottomClosure);
  const [colorFlaps, setColorFlaps] = useState(initialPreferences.colorFlaps);
  const [showPrintLines, setShowPrintLines] = useState(initialPreferences.showPrintLines);
  const [showThumbNotch, setShowThumbNotch] = useState(initialPreferences.showThumbNotch);
  const [showMoreSettings, setShowMoreSettings] = useState(initialPreferences.showMoreSettings);
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
      paperSize,
      orientation,
      bottomClosure,
      colorFlaps,
      showPrintLines,
      showThumbNotch,
      showMoreSettings,
      useWrapArtwork,
      faceModes
    });
  }, [
    unit,
    dimensions,
    paperSize,
    orientation,
    bottomClosure,
    colorFlaps,
    showPrintLines,
    showThumbNotch,
    showMoreSettings,
    useWrapArtwork,
    faceModes
  ]);

  const dimensionsMm = useMemo(
    () => ({
      width: toMillimeters(dimensions.width, unit),
      depth: toMillimeters(dimensions.depth, unit),
      height: toMillimeters(dimensions.height, unit)
    }),
    [dimensions, unit]
  );
  const rawGeometry = useMemo(
    () => calculateDieline(dimensionsMm, bottomClosure),
    [dimensionsMm, bottomClosure]
  );
  const paper = useMemo(
    () => resolvePaper(paperSize, orientation, rawGeometry.totalWidth, rawGeometry.totalHeight),
    [paperSize, orientation, rawGeometry]
  );
  const geometry = useMemo(
    () => geometryForPage(dimensionsMm, paper, bottomClosure),
    [dimensionsMm, paper, bottomClosure]
  );
  const dimensionsValid = Object.values(dimensionsMm).every(
    (value) => Number.isFinite(value) && value > 0
  );
  const fits = dimensionsValid && fitsOnPaper(rawGeometry.totalWidth, rawGeometry.totalHeight, paper);
  const requiredWidth = rawGeometry.totalWidth + BLEED_MM * 2 + SAFE_MARGIN_MM * 2;
  const requiredHeight = rawGeometry.totalHeight + BLEED_MM * 2 + SAFE_MARGIN_MM * 2;

  const setDimension = (key: keyof BoxDimensions, value: string) => {
    setDimensions((current) => ({ ...current, [key]: Number(value) }));
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
                    Use one image to wrap around the front, back and sides
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
                    Include front thumb cutout
                  </label>
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
                </select>
              </label>
              <label className="field">
                <span>Orientation</span>
                <select value={orientation} onChange={(event) => setOrientation(event.target.value as Orientation)}>
                  <option value="auto">Auto</option>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
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
              />
            )}
          </div>
          {!dimensionsValid ? (
            <div className="status-card error">Enter positive values for all three box dimensions.</div>
          ) : !fits ? (
            <div className="status-card error">
              <strong>This box will not fit at 100% scale.</strong>
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
                artwork={artwork}
                faceModes={faceModes}
                faceText={faceText}
                colorFlaps={colorFlaps}
                showPrintLines={showPrintLines}
                showThumbNotch={showThumbNotch}
                useWrapArtwork={useWrapArtwork}
                wrapArtwork={useWrapArtwork ? wrapArtwork : undefined}
              />
            </div>
          </div>

          <section className="export-card">
            <div>
              <h2>Download template</h2>
              <p className="print-instruction">
                Print at Actual size / 100% and disable “Fit to page.” First print a sample
                sheet and measure the 50 mm scale-check line. If it is not exactly 50 mm,
                adjust your printer scale by 50 ÷ measured length × 100%.
              </p>
            </div>
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
          </section>
        </section>
      </div>
    </main>
  );
}
