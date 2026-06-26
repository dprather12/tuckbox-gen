import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style";
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

function defaultText(face: FaceName | "wrap"): TextSettings {
  return {
    content: "",
    html: "",
    fontFamily: "Arial",
    fontSize: 16,
    color: "#17231d",
    align: "center",
    verticalAlign: "center",
    orientation: face === "left" || face === "right" ? "vertical" : "horizontal",
    mirrorVertical: face === "left",
    bold: false,
    italic: false,
    underline: false
  };
}

function parseEditorFontSize(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  const dragDepthRef = useRef(0);
  const textSettings = { ...defaultText(face), ...text };
  const latestTextRef = useRef<TextSettings | undefined>(textSettings);
  const [fontSizeInput, setFontSizeInput] = useState(String(textSettings?.fontSize ?? 16));
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [editorTick, setEditorTick] = useState(0);
  const fontSizeInputFocused = useRef(false);

  useEffect(() => {
    latestTextRef.current = textSettings;
  }, [textSettings]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyleKit.configure({
        backgroundColor: false,
        lineHeight: false
      }),
      Placeholder.configure({
        placeholder: face === "wrap" ? "Enter wrap text" : "Enter text for this face"
      })
    ],
    content: text?.html ?? text?.content ?? "",
    editorProps: {
      attributes: {
        class: "rich-text-prosemirror",
        "aria-label": face === "wrap" ? "Panel text" : `${LABELS[face]} text`
      }
    },
    onUpdate: ({ editor }) => {
      setEditorTick((t) => t + 1);
      const current = latestTextRef.current;
      onTextChange?.({
        ...defaultText(face),
        ...current,
        html: editor.getHTML(),
        content: editor.getText()
      });
    },
    onSelectionUpdate: () => {
      setEditorTick((t) => t + 1);
    }
  }, [face]);

  useEffect(() => {
    if (!editor) return;
    const nextHtml = text?.html ?? text?.content ?? "";
    if ((nextHtml || "<p></p>") !== editor.getHTML()) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
  }, [editor, face, text?.content, text?.html]);

  // Derive formatting state directly from the editor so toolbar buttons
  // always reflect the actual selection, not a separate state variable.
  const isBold = editor?.isActive("bold") ?? false;
  const isItalic = editor?.isActive("italic") ?? false;
  const isUnderline = editor?.isActive("underline") ?? false;
  const currentColor = (editor?.getAttributes("textStyle").color as string | undefined)
    ?? textSettings?.color ?? "#17231d";
  const currentFontFamily = (editor?.getAttributes("textStyle").fontFamily as string | undefined)
    ?? textSettings?.fontFamily ?? "Arial";
  const currentFontSize = parseEditorFontSize(
    editor?.getAttributes("textStyle").fontSize as string | undefined,
    textSettings?.fontSize ?? 16
  );

  // Keep the font size input in sync with the cursor position,
  // but not while the user is actively typing in that field.
  useEffect(() => {
    if (!fontSizeInputFocused.current) {
      setFontSizeInput(String(currentFontSize));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorTick]);

  const patchText = (next: Partial<TextSettings>) => {
    const nextText = { ...defaultText(face), ...latestTextRef.current, ...next };
    latestTextRef.current = nextText;
    onTextChange?.(nextText);
  };

  // When the editor is empty, save formatting changes as the base defaults
  // so the box preview picks them up even before any text is typed.
  const syncDefaultsIfEmpty = (next: Partial<TextSettings>) => {
    if (!editor?.getText().trim()) {
      patchText({
        ...next,
        html: editor?.getHTML() ?? "",
        content: editor?.getText() ?? ""
      });
    }
  };

  const applyFontSize = (fontSize: number) => {
    if (!editor) return;
    editor.chain().setFontSize(`${fontSize}pt`).run();
    syncDefaultsIfEmpty({ fontSize });
  };

  const hasContent = mode === "text" ? Boolean(text?.content.trim()) : Boolean(artwork);

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
        backgroundColor: artwork?.backgroundColor,
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

  return (
    <article
      className={`art-card ${hasContent ? "has-art" : ""} ${face === "wrap" ? "wrap-art-card" : ""} ${isDraggingFile ? "dragging-file" : ""}`}
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

      {onModeChange && (
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
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                handleFile(file);
              }}
            />
            <span>
              {artwork ? "Replace or drag image" : "Choose or drag image"}
              <small>PNG, JPEG, WebP</small>
            </span>
          </label>

          {artwork && (
            <>
              <p className="file-name" title={artwork.name}>{artwork.name}</p>
              <div className="segmented compact fit-mode">
                <button className={artwork.fit === "crop" ? "active" : ""} type="button" onClick={() => patch({ fit: "crop" })}>Crop</button>
                <button className={artwork.fit === "stretch" ? "active" : ""} type="button" onClick={() => patch({ fit: "stretch" })}>Stretch</button>
                {allowRepeat && (
                  <button className={artwork.fit === "repeat" ? "active" : ""} type="button" onClick={() => patch({ fit: "repeat" })}>Repeat</button>
                )}
              </div>

              {artwork.fit === "crop" && (
                <div className="crop-controls">
                  <p className="crop-help">
                    Drag the image in the preview window
                  </p>
                  <div className="range-grid">
                    <label>
                      <span>Zoom <output>{artwork.zoom.toFixed(2)}×</output></span>
                      <input
                        aria-label="Crop zoom"
                        type="range"
                        min="0.2"
                        max="4"
                        step="0.05"
                        value={artwork.zoom}
                        onChange={(event) => patch({ zoom: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                  <div className="crop-actions">
                    <div className="crop-background">
                      <span className="crop-background-label">Background Color</span>
                      <div className="crop-background-row">
                        <input
                          className="color-input"
                          aria-label="Crop background color"
                          type="color"
                          value={artwork.backgroundColor ?? "#ffffff"}
                          onChange={(event) => patch({ backgroundColor: event.target.value })}
                        />
                        <label className="crop-background-toggle">
                          <input
                            type="checkbox"
                            checked={!artwork.backgroundColor}
                            onChange={(event) => patch({ backgroundColor: event.currentTarget.checked ? undefined : "#ffffff" })}
                          />
                          <span>No background</span>
                        </label>
                      </div>
                    </div>

                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {mode === "text" && textSettings && (
        <div className={`text-editor ${face === "wrap" ? "wrap-text-editor" : ""}`}>
          {face !== "wrap" && (
            <div className="text-orientation-group">
              <span>Text orientation</span>
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
            </div>
          )}
          {face !== "wrap" && textSettings.orientation === "vertical" && (
            <label className="mirror-text-option">
              <input
                type="checkbox"
                checked={textSettings.mirrorVertical}
                onChange={(event) => patchText({ mirrorVertical: event.target.checked })}
              />
              Read from the opposite direction
            </label>
          )}
          <EditorContent
            editor={editor}
            className="rich-text-input"
            style={{
              fontFamily: textSettings.fontFamily,
              textAlign: textSettings.align
            }}
          />
          <div className="text-format-row">
            <select
              aria-label="Font"
              value={currentFontFamily}
              onChange={(event) => {
                const fontFamily = event.target.value;
                editor?.chain().focus().setFontFamily(fontFamily).run();
                syncDefaultsIfEmpty({ fontFamily });
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
                aria-label="Font size"
                type="number"
                min="6"
                max="72"
                step="1"
                value={fontSizeInput}
                onFocus={() => { fontSizeInputFocused.current = true; }}
                onBlur={() => {
                  fontSizeInputFocused.current = false;
                  setFontSizeInput(String(currentFontSize));
                }}
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
                      applyFontSize(fontSize);
                    }
                    editor?.commands.focus();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    editor?.commands.focus();
                  }
                }}
              />
              <span>pt</span>
            </label>
            <input
              className="color-input"
              aria-label="Text color"
              type="color"
              value={currentColor}
              onChange={(event) => {
                const color = event.target.value;
                editor?.chain().focus().setColor(color).run();
                syncDefaultsIfEmpty({ color });
              }}
            />
          </div>
          <div className="text-toolbar" aria-label="Text formatting">
            <button
              className={isBold ? "active" : ""}
              type="button"
              aria-label="Bold"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleBold().run();
                syncDefaultsIfEmpty({ bold: !isBold });
              }}
            >
              <strong>B</strong>
            </button>
            <button
              className={isItalic ? "active" : ""}
              type="button"
              aria-label="Italic"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleItalic().run();
                syncDefaultsIfEmpty({ italic: !isItalic });
              }}
            >
              <em>I</em>
            </button>
            <button
              className={isUnderline ? "active" : ""}
              type="button"
              aria-label="Underline"
              onMouseDown={(event) => {
                event.preventDefault();
                editor?.chain().focus().toggleUnderline().run();
                syncDefaultsIfEmpty({ underline: !isUnderline });
              }}
            >
              <u>U</u>
            </button>
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
            {(["top", "center", "bottom"] as const).map((verticalAlign) => (
              <button
                key={verticalAlign}
                className={textSettings.verticalAlign === verticalAlign ? "active" : ""}
                type="button"
                aria-label={`Position ${verticalAlign}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  patchText({ verticalAlign });
                }}
              >
                <span className={`valign-icon ${verticalAlign}`}>≡</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
