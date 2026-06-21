import { useEffect, useRef, useState } from "react";
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

function defaultText(face: FaceName): TextSettings {
  return {
    content: "",
    html: "",
    fontFamily: "Arial",
    fontSize: 16,
    color: "#17231d",
    align: "center",
    orientation: face === "left" || face === "right" ? "vertical" : "horizontal",
    mirrorVertical: false,
    bold: false,
    italic: false,
    underline: false
  };
}

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
  const editorRef = useRef<HTMLDivElement>(null);
  const fontSizeRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const dragDepthRef = useRef(0);
  const faceDefaults = face === "wrap" ? undefined : defaultText(face);
  const textSettings = text ?? faceDefaults;
  const [fontSizeInput, setFontSizeInput] = useState(String(textSettings?.fontSize ?? 16));
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    if (!editorRef.current || face === "wrap") return;
    const nextHtml = text?.html ?? text?.content ?? "";
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [face, text?.content, text?.html]);

  useEffect(() => {
    setFontSizeInput(String(textSettings?.fontSize ?? 16));
  }, [textSettings?.fontSize]);

  const handleFile = (file?: File) => {
    if (!file) return false;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      window.alert("Please choose a PNG, JPEG, or WebP image.");
      return false;
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
    return true;
  };

  const hasDraggedFiles = (event: React.DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event) && dragDepthRef.current === 0) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (handleFile(event.dataTransfer.files[0])) {
      onModeChange?.("image");
    }
  };

  const patch = (next: Partial<ArtworkSettings>) => {
    if (artwork) onChange(face, { ...artwork, ...next });
  };

  const patchText = (next: Partial<TextSettings>) => {
    if (face === "wrap") return;
    onTextChange?.({ ...defaultText(face), ...text, ...next });
  };

  const syncEditor = (settings?: Partial<TextSettings>) => {
    const editor = editorRef.current;
    if (!editor) return;
    patchText({
      html: editor.innerHTML,
      content: editor.innerText.replace(/\u00a0/g, " "),
      ...settings
    });
    saveSelection();
  };

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selection || !selectionRef.current) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  };

  const applyCommand = (
    command: string,
    value?: string,
    settings?: Partial<TextSettings>
  ) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    syncEditor(settings);
  };

  const applyFontSize = (fontSize: number, returnToInput = true) => {
    const input = fontSizeRef.current;
    const editor = editorRef.current;
    const range = selectionRef.current?.cloneRange();
    if (!editor || !range || range.collapsed || !editor.contains(range.commonAncestorContainer)) {
      if (returnToInput) requestAnimationFrame(() => input?.focus());
      return;
    }

    const span = document.createElement("span");
    span.style.fontSize = `${fontSize}pt`;
    span.appendChild(range.extractContents());
    range.insertNode(span);

    const selection = window.getSelection();
    const selectedRange = document.createRange();
    selectedRange.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(selectedRange);
    selectionRef.current = selectedRange.cloneRange();

    syncEditor();
    if (returnToInput) requestAnimationFrame(() => input?.focus());
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  };

  const hasContent = mode === "text" ? Boolean(text?.content.trim()) : Boolean(artwork);

  return (
    <article
      className={`art-card ${hasContent ? "has-art" : ""} ${allowRepeat ? "wrap-art-card" : ""} ${isDraggingFile ? "dragging-file" : ""}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingFile && (
        <div className="drop-overlay" aria-hidden="true">
          Drop image here
        </div>
      )}
      <div className="art-card-heading">
        <h3>{face === "wrap" ? "Wrap image" : LABELS[face]}</h3>
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
              {artwork ? "Replace or drag image" : "Choose or drag image"}
              <small>PNG, JPEG, WebP</small>
            </span>
          </label>

          {artwork && (
            <>
              <p className="file-name" title={artwork.name}>{artwork.name}</p>
              <div className="segmented compact">
                <button className={artwork.fit === "crop" ? "active" : ""} type="button" onClick={() => patch({ fit: "crop" })}>Crop</button>
                <button className={artwork.fit === "stretch" ? "active" : ""} type="button" onClick={() => patch({ fit: "stretch" })}>Stretch</button>
                {allowRepeat && (
                  <button className={artwork.fit === "repeat" ? "active" : ""} type="button" onClick={() => patch({ fit: "repeat" })}>Repeat</button>
                )}
              </div>

              {artwork.fit === "crop" && (
                <div className="range-grid">
                  <label>
                    <span>Zoom <output>{artwork.zoom.toFixed(1)}×</output></span>
                    <input type="range" min="1" max="3" step="0.1" value={artwork.zoom} onChange={(event) => patch({ zoom: Number(event.target.value) })} />
                  </label>
                  <label>
                    <span>Horizontal <output>{artwork.offsetX}%</output></span>
                    <input type="range" min="-100" max="100" value={artwork.offsetX} onChange={(event) => patch({ offsetX: Number(event.target.value) })} />
                  </label>
                  <label>
                    <span>Vertical <output>{artwork.offsetY}%</output></span>
                    <input type="range" min="-100" max="100" value={artwork.offsetY} onChange={(event) => patch({ offsetY: Number(event.target.value) })} />
                  </label>
                </div>
              )}
            </>
          )}
        </>
      )}

      {mode === "text" && face !== "wrap" && textSettings && (
        <div className="text-editor">
          <div className="segmented compact text-orientation">
            <button
              className={textSettings.orientation === "horizontal" ? "active" : ""}
              type="button"
              onClick={() => patchText({ orientation: "horizontal" })}
            >
              Horizontal
            </button>
            <button
              className={textSettings.orientation === "vertical" ? "active" : ""}
              type="button"
              onClick={() => patchText({ orientation: "vertical" })}
            >
              Vertical
            </button>
          </div>
          {textSettings.orientation === "vertical" && (
            <label className="mirror-text-option">
              <input
                type="checkbox"
                checked={textSettings.mirrorVertical}
                onChange={(event) => patchText({ mirrorVertical: event.target.checked })}
              />
              Read from the opposite direction
            </label>
          )}
          <div
            ref={editorRef}
            className="rich-text-input"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={`${LABELS[face]} text`}
            data-placeholder="Enter text for this face"
            onInput={() => syncEditor()}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onFocus={saveSelection}
            onPaste={handlePaste}
          />
          <div className="text-format-row">
            <select
              aria-label="Font"
              value={textSettings.fontFamily}
              onMouseDown={saveSelection}
              onChange={(event) => {
                applyCommand("fontName", event.target.value, {
                  fontFamily: event.target.value
                });
              }}
            >
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Verdana">Verdana</option>
              <option value="Courier New">Courier New</option>
            </select>
            <label className="text-size">
              <input
                ref={fontSizeRef}
                aria-label="Font size"
                type="number"
                min="6"
                max="72"
                step="1"
                value={fontSizeInput}
                onMouseDown={saveSelection}
                onChange={(event) => {
                  const value = event.target.value;
                  setFontSizeInput(value);
                  const parsed = Number(value);
                  if (Number.isFinite(parsed) && parsed >= 6 && parsed <= 72) {
                    applyFontSize(parsed);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const parsed = Number(event.currentTarget.value);
                    if (Number.isFinite(parsed)) {
                      const fontSize = Math.min(72, Math.max(6, parsed));
                      setFontSizeInput(String(fontSize));
                      applyFontSize(fontSize, false);
                    }
                    editorRef.current?.focus();
                    restoreSelection();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    editorRef.current?.focus();
                    restoreSelection();
                  }
                }}
              />
              <span>pt</span>
            </label>
            <input
              className="color-input"
              aria-label="Text color"
              type="color"
              value={textSettings.color}
              onMouseDown={saveSelection}
              onChange={(event) => {
                applyCommand("foreColor", event.target.value, {
                  color: event.target.value
                });
              }}
            />
          </div>
          <div className="text-toolbar" aria-label="Text formatting">
            <button type="button" aria-label="Bold" onMouseDown={(event) => { event.preventDefault(); applyCommand("bold"); }}><strong>B</strong></button>
            <button type="button" aria-label="Italic" onMouseDown={(event) => { event.preventDefault(); applyCommand("italic"); }}><em>I</em></button>
            <button type="button" aria-label="Underline" onMouseDown={(event) => { event.preventDefault(); applyCommand("underline"); }}><u>U</u></button>
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                className={textSettings.align === align ? "active" : ""}
                type="button"
                aria-label={`Align ${align}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  patchText({ align });
                }}
              >
                <span className={`align-icon ${align}`}>≡</span>
              </button>
            ))}
          </div>
          <p className="selection-hint">Select text before applying font, size, color, or style.</p>
        </div>
      )}
    </article>
  );
}
