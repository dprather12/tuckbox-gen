import { useMemo, useRef, useState } from "react";
import { ArtworkControl } from "./components/ArtworkControl";
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
import type {
  ArtworkMap,
  ArtworkSettings,
  BottomClosure,
  BoxDimensions,
  FaceName,
  Orientation,
  PaperSize,
  Unit
} from "./types";

const faces: FaceName[] = ["front", "back", "left", "right", "top", "bottom"];

export default function App() {
  const [unit, setUnit] = useState<Unit>("in");
  const [dimensions, setDimensions] = useState<BoxDimensions>({
    width: 2.5,
    depth: 0.75,
    height: 3.5
  });
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [bottomClosure, setBottomClosure] = useState<BottomClosure>("tuck");
  const [colorFlaps, setColorFlaps] = useState(true);
  const [artwork, setArtwork] = useState<ArtworkMap>({});
  const [exporting, setExporting] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const handlePdf = async () => {
    if (!svgRef.current || !fits) return;
    setExporting(true);
    try {
      await downloadPdf(svgRef.current, paper, false);
      trackEvent("template_download", {
        format: "pdf",
        paper: paper.name,
        orientation: paper.orientation,
        artwork_faces: Object.keys(artwork).length
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

          <section className="control-section">
            <div className="section-heading">
              <div>
                <h2>Paper setup</h2>
              </div>
            </div>
            <div className="two-column">
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
            <p className="resolved-note">
              Using {paper.name}, {paper.orientation} · {paper.width.toFixed(1)} × {paper.height.toFixed(1)} mm
            </p>
          </section>

          <section className="control-section artwork-section">
            <div className="section-heading">
              <div>
                <h2>Panel artwork</h2>
              </div>
            </div>
            <p className="section-copy">PNG, JPEG, or WebP. Each face can be cropped or stretched independently.</p>
            <label className="white-flaps-option">
              <input
                type="checkbox"
                checked={!colorFlaps}
                onChange={(event) => setColorFlaps(!event.target.checked)}
              />
              Leave tabs and dust flaps white
            </label>
            <div className="artwork-grid">
              {faces.map((face) => (
                <ArtworkControl
                  key={face}
                  face={face}
                  artwork={artwork[face]}
                  onChange={updateArtwork}
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
                colorFlaps={colorFlaps}
              />
            </div>
          </div>

          <section className="export-card">
            <div>
              <h2>Download template</h2>
              <p>Print at <strong>Actual size / 100%</strong>. Disable “Fit to page” in the print dialog.</p>
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
                    artwork_faces: Object.keys(artwork).length
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
