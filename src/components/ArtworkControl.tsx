import type {
  ArtworkSettings,
  FaceContentMode,
  FaceName,
  TextSettings
} from "../types";
import { extractDominantColor } from "../color";

interface Props {
  face: FaceName | "wrap";
  artwork?: ArtworkSettings;
  onChange: (face: FaceName | "wrap", artwork?: ArtworkSettings) => void;
  allowRepeat?: boolean;
  mode?: FaceContentMode;
  onModeChange?: (mode: FaceContentMode) => void;
  text?: TextSettings;
  onTextChange?: (text?: TextSettings) => void;
}

const LABELS: Record<FaceName, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
  top: "Top",
  bottom: "Bottom"
};

const DEFAULT_TEXT: TextSettings = {
  content: "",
  fontFamily: "Arial",
  fontSize: 16,
  color: "#17231d",
  align: "center",
  bold: false,
  italic: false,
  underline: false
};

export function ArtworkControl({
  face,
  artwork,
  onChange,
  allowRepeat = false,
  mode = "image",
  onModeChange,
  text,
  onTextChange
}: Props) {
  const handleFile = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      window.alert("Please choose a PNG, JPEG, or WebP image.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const src = String(reader.result);
      let dominantColor: string | undefined;
      try {
        dominantColor = await extractDominantColor(src);
      } catch {
        // The image remains usable if pixel sampling is unavailable.
      }
      const image = new Image();
      image.src = src;
      try {
        await image.decode();
      } catch {
        // Dimensions are optional; rendering has a safe fallback.
      }
      onChange(face, {
        src,
        name: file.name,
        fit: artwork?.fit ?? "stretch",
        zoom: artwork?.zoom ?? 1,
        offsetX: artwork?.offsetX ?? 0,
        offsetY: artwork?.offsetY ?? 0,
        dominantColor,
        imageWidth: image.naturalWidth || undefined,
        imageHeight: image.naturalHeight || undefined
      });
    };
    reader.readAsDataURL(file);
  };

  const patch = (next: Partial<ArtworkSettings>) => {
    if (artwork) onChange(face, { ...artwork, ...next });
  };

  const patchText = (next: Partial<TextSettings>) => {
    onTextChange?.({ ...(text ?? DEFAULT_TEXT), ...next });
  };

  const hasContent = mode === "text" ? Boolean(text?.content) : Boolean(artwork);

  return (
    <article className={`art-card ${hasContent ? "has-art" : ""} ${allowRepeat ? "wrap-art-card" : ""}`}>
      <div className="art-card-heading">
        <h3>{face === "wrap" ? "Wraparound body" : LABELS[face]}</h3>
        {mode === "image" && artwork && (
          <button className="text-button danger" type="button" onClick={() => onChange(face)}>
            Remove
          </button>
        )}
        {mode === "text" && text?.content && (
          <button className="text-button danger" type="button" onClick={() => onTextChange?.()}>
            Clear
          </button>
        )}
      </div>

      {face !== "wrap" && onModeChange && (
        <div className="segmented compact content-mode">
          <button
            className={mode === "image" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("image")}
          >
            Image
          </button>
          <button
            className={mode === "text" ? "active" : ""}
            type="button"
            onClick={() => onModeChange("text")}
          >
            Text
          </button>
        </div>
      )}

      {mode === "image" && (
        <>
          <label className="upload-button">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <span>
              {artwork ? "Replace image" : "Choose image"}
              <small>PNG, JPEG</small>
            </span>
          </label>

          {artwork && (
            <>
              <p className="file-name" title={artwork.name}>{artwork.name}</p>
              <div className="segmented compact">
                <button
                  className={artwork.fit === "crop" ? "active" : ""}
                  type="button"
                  onClick={() => patch({ fit: "crop" })}
                >
                  Crop
                </button>
                <button
                  className={artwork.fit === "stretch" ? "active" : ""}
                  type="button"
                  onClick={() => patch({ fit: "stretch" })}
                >
                  Stretch
                </button>
                {allowRepeat && (
                  <button
                    className={artwork.fit === "repeat" ? "active" : ""}
                    type="button"
                    onClick={() => patch({ fit: "repeat" })}
                  >
                    Repeat
                  </button>
                )}
              </div>

              {artwork.fit === "crop" && (
                <div className="range-grid">
                  <label>
                    <span>Zoom <output>{artwork.zoom.toFixed(1)}×</output></span>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.1"
                      value={artwork.zoom}
                      onChange={(event) => patch({ zoom: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Horizontal <output>{artwork.offsetX}%</output></span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={artwork.offsetX}
                      onChange={(event) => patch({ offsetX: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Vertical <output>{artwork.offsetY}%</output></span>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={artwork.offsetY}
                      onChange={(event) => patch({ offsetY: Number(event.target.value) })}
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}

      {mode === "text" && face !== "wrap" && (
        <div className="text-editor">
          <textarea
            aria-label={`${LABELS[face]} text`}
            placeholder="Enter text for this face"
            value={text?.content ?? ""}
            onChange={(event) => patchText({ content: event.target.value })}
          />
          <div className="text-format-row">
            <select
              aria-label="Font"
              value={text?.fontFamily ?? DEFAULT_TEXT.fontFamily}
              onChange={(event) => patchText({ fontFamily: event.target.value })}
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
            </select>
            <label className="text-size">
              <input
                aria-label="Font size"
                type="number"
                min="6"
                max="72"
                value={text?.fontSize ?? DEFAULT_TEXT.fontSize}
                onChange={(event) => patchText({ fontSize: Math.max(6, Number(event.target.value)) })}
              />
              <span>pt</span>
            </label>
            <input
              className="color-input"
              aria-label="Text color"
              type="color"
              value={text?.color ?? DEFAULT_TEXT.color}
              onChange={(event) => patchText({ color: event.target.value })}
            />
          </div>
          <div className="text-toolbar" aria-label="Text formatting">
            <button
              className={text?.bold ? "active" : ""}
              type="button"
              aria-label="Bold"
              onClick={() => patchText({ bold: !text?.bold })}
            >
              <strong>B</strong>
            </button>
            <button
              className={text?.italic ? "active" : ""}
              type="button"
              aria-label="Italic"
              onClick={() => patchText({ italic: !text?.italic })}
            >
              <em>I</em>
            </button>
            <button
              className={text?.underline ? "active" : ""}
              type="button"
              aria-label="Underline"
              onClick={() => patchText({ underline: !text?.underline })}
            >
              <u>U</u>
            </button>
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                className={(text?.align ?? DEFAULT_TEXT.align) === align ? "active" : ""}
                type="button"
                aria-label={`Align ${align}`}
                onClick={() => patchText({ align })}
              >
                <span className={`align-icon ${align}`}>≡</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
