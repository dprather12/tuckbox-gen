import type { ArtworkSettings, Rect, TextSettings } from "../types";

interface RichStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface RichPiece {
  text: string;
  style: RichStyle;
}

function parseFontSize(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (value.endsWith("px")) return parsed * 0.75;
  return parsed;
}

function richPieces(settings: TextSettings): RichPiece[] {
  const base: RichStyle = {
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    color: settings.color,
    bold: settings.bold,
    italic: settings.italic,
    underline: settings.underline
  };
  const html = settings.html || settings.content.replace(/\n/g, "<br>");
  const documentNode = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const pieces: RichPiece[] = [];

  const visit = (node: Node, inherited: RichStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) pieces.push({ text, style: inherited });
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const tag = node.tagName.toLowerCase();
    if (tag === "br") {
      pieces.push({ text: "\n", style: inherited });
      return;
    }

    const style = { ...inherited };
    if (tag === "b" || tag === "strong" || node.style.fontWeight === "bold" || Number(node.style.fontWeight) >= 600) style.bold = true;
    if (tag === "i" || tag === "em" || node.style.fontStyle === "italic") style.italic = true;
    if (tag === "u" || node.style.textDecoration.includes("underline")) style.underline = true;
    if (tag === "font") {
      style.color = node.getAttribute("color") || style.color;
      style.fontFamily = node.getAttribute("face") || style.fontFamily;
    }
    if (node.style.color) style.color = node.style.color;
    if (node.style.fontFamily) style.fontFamily = node.style.fontFamily.replace(/["']/g, "");
    if (node.style.fontSize) style.fontSize = parseFontSize(node.style.fontSize, style.fontSize);

    const block = tag === "div" || tag === "p";
    if (block && pieces.length && !pieces.at(-1)?.text.endsWith("\n")) {
      pieces.push({ text: "\n", style });
    }
    node.childNodes.forEach((child) => visit(child, style));
    if (block && !pieces.at(-1)?.text.endsWith("\n")) {
      pieces.push({ text: "\n", style });
    }
  };

  documentNode.body.firstElementChild?.childNodes.forEach((node) => visit(node, base));
  if (pieces.at(-1)?.text === "\n") pieces.pop();
  return pieces;
}

function pieceWidth(piece: RichPiece): number {
  const fontSizeMm = piece.style.fontSize * 0.352778;
  return [...piece.text].reduce(
    (width, character) =>
      width + fontSizeMm * (character === " " ? 0.33 : 0.55) * (piece.style.bold ? 1.04 : 1),
    0
  );
}

function layoutRichText(pieces: RichPiece[], maxWidth: number): RichPiece[][] {
  const lines: RichPiece[][] = [[]];
  let width = 0;

  const append = (piece: RichPiece) => {
    const line = lines.at(-1)!;
    const previous = line.at(-1);
    if (previous && JSON.stringify(previous.style) === JSON.stringify(piece.style)) {
      previous.text += piece.text;
    } else {
      line.push({ ...piece });
    }
  };

  pieces.forEach((piece) => {
    piece.text.split(/(\n|\s+)/).filter(Boolean).forEach((token) => {
      if (token === "\n") {
        lines.push([]);
        width = 0;
        return;
      }

      const tokenPiece = { text: token, style: piece.style };
      const tokenWidth = pieceWidth(tokenPiece);
      if (width > 0 && width + tokenWidth > maxWidth && token.trim()) {
        lines.push([]);
        width = 0;
      }

      if (tokenWidth <= maxWidth) {
        if (width === 0 && !token.trim()) return;
        append(tokenPiece);
        width += tokenWidth;
        return;
      }

      [...token].forEach((character) => {
        const characterPiece = { text: character, style: piece.style };
        const characterWidth = pieceWidth(characterPiece);
        if (width > 0 && width + characterWidth > maxWidth) {
          lines.push([]);
          width = 0;
        }
        append(characterPiece);
        width += characterWidth;
      });
    });
  });

  return lines;
}


function cropImageRect(rect: Rect, artwork: ArtworkSettings): Rect {
  const targetRatio = rect.width / rect.height;
  const imageRatio =
    artwork.imageWidth && artwork.imageHeight
      ? artwork.imageWidth / artwork.imageHeight
      : targetRatio;
  const baseWidth = imageRatio > targetRatio ? rect.height * imageRatio : rect.width;
  const baseHeight = imageRatio > targetRatio ? rect.height : rect.width / imageRatio;
  const zoom = Math.max(artwork.zoom || 1, 0.01);
  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  const desiredX =
    rect.x - (width - rect.width) / 2 + (artwork.offsetX / 100) * rect.width * 0.5;
  const desiredY =
    rect.y - (height - rect.height) / 2 + (artwork.offsetY / 100) * rect.height * 0.5;

  return {
    x: desiredX,
    y: desiredY,
    width,
    height
  };
}

export function ArtworkImage({
  rect,
  artwork,
  clipId,
  maskId,
  transform,
  opacity = 1
}: {
  rect: Rect;
  artwork?: ArtworkSettings;
  clipId: string;
  maskId?: string;
  transform?: string;
  opacity?: number;
}) {
  if (!artwork) return null;

  if (artwork.fit === "stretch") {
    return (
      <image
        href={artwork.src}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        preserveAspectRatio="none"
        clipPath={`url(#${clipId})`}
        mask={maskId ? `url(#${maskId})` : undefined}
        transform={transform}
        opacity={opacity}
      />
    );
  }

  const cropRect = cropImageRect(rect, artwork);

  return (
    <g
      clipPath={`url(#${clipId})`}
      mask={maskId ? `url(#${maskId})` : undefined}
      transform={transform}
      opacity={opacity}
    >
      {artwork.backgroundColor && (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          fill={artwork.backgroundColor}
        />
      )}
      <image
        href={artwork.src}
        x={cropRect.x}
        y={cropRect.y}
        width={cropRect.width}
        height={cropRect.height}
        preserveAspectRatio="none"
      />
    </g>
  );
}

export function FaceText({
  rect,
  settings,
  clipId,
  opacity = 1
}: {
  rect: Rect;
  settings?: TextSettings;
  clipId: string;
  opacity?: number;
}) {
  if (!settings?.content.trim()) return null;

  const orientation = settings.orientation ??
    (rect.width < rect.height * 0.4 ? "vertical" : "horizontal");
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const layoutRect = orientation === "vertical"
    ? {
        x: centerX - rect.height / 2,
        y: centerY - rect.width / 2,
        width: rect.height,
        height: rect.width
      }
    : rect;
  const padding = Math.min(3, layoutRect.width * 0.08, layoutRect.height * 0.08);
  const lines = layoutRichText(richPieces(settings), layoutRect.width - padding * 2);
  const lineHeights = lines.map((line) =>
    Math.max(settings.fontSize, ...line.map((piece) => piece.style.fontSize)) * 0.352778 * 1.22
  );
  const availableHeight = layoutRect.height - padding * 2;
  let usedHeight = 0;
  const visibleLines = lines.filter((_, index) => {
    if (usedHeight + lineHeights[index] > availableHeight) return false;
    usedHeight += lineHeights[index];
    return true;
  });
  const verticalAlign = settings.verticalAlign ?? "center";
  const startY =
    verticalAlign === "top"
      ? layoutRect.y + padding
      : verticalAlign === "bottom"
        ? layoutRect.y + layoutRect.height - padding - usedHeight
        : layoutRect.y + (layoutRect.height - usedHeight) / 2;
  const x =
    settings.align === "left"
      ? layoutRect.x + padding
      : settings.align === "right"
        ? layoutRect.x + layoutRect.width - padding
        : layoutRect.x + layoutRect.width / 2;
  const anchor =
    settings.align === "left" ? "start" : settings.align === "right" ? "end" : "middle";
  let currentY = startY;

  return (
    <g clipPath={`url(#${clipId})`} opacity={opacity}>
      <g
        transform={
          orientation === "vertical"
            ? `rotate(${settings.mirrorVertical ? -90 : 90} ${centerX} ${centerY})`
            : undefined
        }
      >
        {visibleLines.map((line, lineIndex) => {
          const lineHeight = lineHeights[lineIndex];
          currentY += lineHeight;
          return (
            <text key={lineIndex} x={x} y={currentY - lineHeight * 0.2} textAnchor={anchor}>
              {line.map((piece, pieceIndex) => (
                <tspan
                  key={pieceIndex}
                  fill={piece.style.color}
                  fontFamily={piece.style.fontFamily}
                  fontSize={piece.style.fontSize * 0.352778}
                  fontWeight={piece.style.bold ? "700" : "400"}
                  fontStyle={piece.style.italic ? "italic" : "normal"}
                  textDecoration={piece.style.underline ? "underline" : "none"}
                >
                  {piece.text}
                </tspan>
              ))}
            </text>
          );
        })}
      </g>
    </g>
  );
}
