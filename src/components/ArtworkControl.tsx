import type { ArtworkSettings, FaceName } from "../types";
import { extractDominantColor } from "../color";

interface Props {
  face: FaceName;
  artwork?: ArtworkSettings;
  onChange: (face: FaceName, artwork?: ArtworkSettings) => void;
}

const LABELS: Record<FaceName, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
  top: "Top",
  bottom: "Bottom"
};

export function ArtworkControl({ face, artwork, onChange }: Props) {
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
      onChange(face, {
        src,
        name: file.name,
        fit: artwork?.fit ?? "stretch",
        zoom: artwork?.zoom ?? 1,
        offsetX: artwork?.offsetX ?? 0,
        offsetY: artwork?.offsetY ?? 0,
        dominantColor
      });
    };
    reader.readAsDataURL(file);
  };

  const patch = (next: Partial<ArtworkSettings>) => {
    if (artwork) onChange(face, { ...artwork, ...next });
  };

  return (
    <article className={`art-card ${artwork ? "has-art" : ""}`}>
      <div className="art-card-heading">
        <div>
          <h3>{LABELS[face]}</h3>
        </div>
        {artwork && (
          <button className="text-button danger" type="button" onClick={() => onChange(face)}>
            Remove
          </button>
        )}
      </div>

      <label className="upload-button">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <span>{artwork ? "Replace image" : "Choose image"}</span>
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
    </article>
  );
}
