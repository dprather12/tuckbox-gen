import { forwardRef, useId } from "react";
import { BLEED_MM, SAFE_MARGIN_MM } from "../geometry";
import type {
  ArtworkMap,
  ArtworkSettings,
  DielineGeometry,
  FaceModeMap,
  FaceName,
  Paper,
  Rect,
  TextMap,
  TextSettings
} from "../types";

interface Props {
  paper: Paper;
  geometry: DielineGeometry;
  artwork: ArtworkMap;
  faceModes: FaceModeMap;
  faceText: TextMap;
  colorFlaps: boolean;
  showPrintLines: boolean;
  showThumbNotch: boolean;
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
}

function ArtworkImage({
  rect,
  artwork,
  clipId,
  maskId,
  transform
}: {
  rect: Rect;
  artwork?: ArtworkSettings;
  clipId: string;
  maskId?: string;
  transform?: string;
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
      />
    );
  }

  const zoomedWidth = rect.width * artwork.zoom;
  const zoomedHeight = rect.height * artwork.zoom;
  const x = rect.x - (zoomedWidth - rect.width) / 2 + (artwork.offsetX / 100) * rect.width * 0.5;
  const y = rect.y - (zoomedHeight - rect.height) / 2 + (artwork.offsetY / 100) * rect.height * 0.5;

  return (
    <image
      href={artwork.src}
      x={x}
      y={y}
      width={zoomedWidth}
      height={zoomedHeight}
      preserveAspectRatio="xMidYMid slice"
      clipPath={`url(#${clipId})`}
      mask={maskId ? `url(#${maskId})` : undefined}
      transform={transform}
    />
  );
}

function DustFlap({
  x,
  y,
  width,
  height,
  top,
  fill,
  showOutline
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  top: boolean;
  fill?: string;
  showOutline: boolean;
}) {
  const inset = Math.min(width * 0.2, 3);
  const points = top
    ? `${x},${y + height} ${x + inset},${y} ${x + width - inset},${y} ${x + width},${y + height}`
    : `${x + width},${y} ${x + width - inset},${y + height} ${x + inset},${y + height} ${x},${y}`;
  return (
    <g>
      <polygon points={points} className="flap-fill" style={{ fill: fill ?? "none" }} />
      {showOutline && <polyline points={points} className="cut-shape" />}
    </g>
  );
}

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

function FaceText({
  rect,
  settings,
  clipId
}: {
  rect: Rect;
  settings?: TextSettings;
  clipId: string;
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
  const startY = layoutRect.y + (layoutRect.height - usedHeight) / 2;
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
    <g clipPath={`url(#${clipId})`}>
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

export const DielinePreview = forwardRef<SVGSVGElement, Props>(
  ({ paper, geometry, artwork, faceModes, faceText, colorFlaps, showPrintLines, showThumbNotch, useWrapArtwork, wrapArtwork }, ref) => {
    const rawId = useId().replace(/:/g, "");
    const g = geometry;
    const px = g.pageX;
    const py = g.pageY;
    const panels = Object.fromEntries(
      Object.entries(g.panels).map(([key, rect]) => [
        key,
        { ...rect, x: rect.x + px, y: rect.y + py }
      ])
    ) as DielineGeometry["panels"];
    const top = { ...g.top, x: g.top.x + px, y: g.top.y + py };
    const bottom = { ...g.bottom, x: g.bottom.x + px, y: g.bottom.y + py };
    const bottomUnderFlap = g.bottomUnderFlap
      ? {
          ...g.bottomUnderFlap,
          x: g.bottomUnderFlap.x + px,
          y: g.bottomUnderFlap.y + py
        }
      : undefined;
    const faces: Array<[FaceName, Rect]> = [
      ["back", panels.back],
      ["left", panels.left],
      ["front", panels.front],
      ["right", panels.right],
      ["top", top],
      ["bottom", bottom]
    ];
    const bodyBottom = py + g.bodyY + panels.back.height;
    const rightEdge = px + 2 * panels.back.width + 2 * panels.left.width;
    const glueX = rightEdge;
    const bodyRect = {
      x: px,
      y: py + g.bodyY,
      width: rightEdge - px,
      height: panels.back.height
    };
    const wrapTileHeight = bodyRect.height;
    const wrapTileWidth =
      wrapArtwork?.imageWidth && wrapArtwork.imageHeight
        ? wrapTileHeight * (wrapArtwork.imageWidth / wrapArtwork.imageHeight)
        : wrapTileHeight;
    const topFlapPath = `M ${top.x + top.width} ${top.y} L ${top.x + top.width} ${top.y - g.tuckLip * 0.35} Q ${top.x + top.width / 2} ${top.y - g.tuckLip} ${top.x} ${top.y - g.tuckLip * 0.35} L ${top.x} ${top.y}`;
    const bottomFlapPath = `M ${bottom.x} ${bottom.y + bottom.height} L ${bottom.x} ${bottom.y + bottom.height + g.tuckLip * 0.35} Q ${bottom.x + bottom.width / 2} ${bottom.y + bottom.height + g.tuckLip} ${bottom.x + bottom.width} ${bottom.y + bottom.height + g.tuckLip * 0.35} L ${bottom.x + bottom.width} ${bottom.y + bottom.height}`;
    const bottomUnderPath = bottomUnderFlap
      ? `M ${bottomUnderFlap.x} ${bottomUnderFlap.y} L ${bottomUnderFlap.x + 3} ${bottomUnderFlap.y + bottomUnderFlap.height} L ${bottomUnderFlap.x + bottomUnderFlap.width - 3} ${bottomUnderFlap.y + bottomUnderFlap.height} L ${bottomUnderFlap.x + bottomUnderFlap.width} ${bottomUnderFlap.y}`
      : "";
    const dustPoints = (rect: Rect, topSide: boolean) => {
      const inset = Math.min(rect.width * 0.2, 3);
      return topSide
        ? `${rect.x},${rect.y + rect.height} ${rect.x + inset},${rect.y} ${rect.x + rect.width - inset},${rect.y} ${rect.x + rect.width},${rect.y + rect.height}`
        : `${rect.x + rect.width},${rect.y} ${rect.x + rect.width - inset},${rect.y + rect.height} ${rect.x + inset},${rect.y + rect.height} ${rect.x},${rect.y}`;
    };
    const leftTopDust = { x: panels.left.x, y: py + g.tuckLip, width: panels.left.width, height: panels.left.width };
    const rightTopDust = { x: panels.right.x, y: py + g.tuckLip, width: panels.right.width, height: panels.right.width };
    const leftBottomDust = { x: panels.left.x, y: bodyBottom, width: panels.left.width, height: panels.left.width };
    const rightBottomDust = { x: panels.right.x, y: bodyBottom, width: panels.right.width, height: panels.right.width };
    const gluePoints = `${glueX},${py + g.bodyY} ${glueX + g.glueTab},${py + g.bodyY + 4} ${glueX + g.glueTab},${bodyBottom - 4} ${glueX},${bodyBottom}`;
    const imageForFace = (face: FaceName) =>
      (faceModes[face] ?? "image") === "image" ? artwork[face] : undefined;
    const reliefCutLength = Math.min(4, Math.max(2, g.tuckLip * 0.22));
    const frontTopY = py + g.bodyY;
    const frontCenterX = panels.front.x + panels.front.width / 2;
    const thumbNotchRadius = Math.min(7, Math.max(3.5, panels.front.width * 0.09));
    const frontThumbNotchPath =
      `M ${panels.front.x} ${frontTopY} ` +
      `H ${frontCenterX - thumbNotchRadius} ` +
      `A ${thumbNotchRadius} ${thumbNotchRadius} 0 0 0 ${frontCenterX + thumbNotchRadius} ${frontTopY} ` +
      `H ${panels.front.x + panels.front.width}`;

    return (
      <svg
        ref={ref}
        className="dieline-svg"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        viewBox={`0 0 ${paper.width} ${paper.height}`}
        width={`${paper.width}mm`}
        height={`${paper.height}mm`}
        aria-label="Tuckbox dieline preview"
      >
        <defs>
          {faces.map(([face, rect]) => (
            <clipPath id={`${rawId}-${face}`} key={face}>
              <rect {...rect} />
            </clipPath>
          ))}
          <clipPath id={`${rawId}-body-wrap`}><rect {...bodyRect} /></clipPath>
          <pattern
            id={`${rawId}-wrap-pattern`}
            patternUnits="userSpaceOnUse"
            x="0"
            y="0"
            width={wrapTileWidth}
            height={wrapTileHeight}
          >
            {wrapArtwork && (
              <image
                href={wrapArtwork.src}
                width={wrapTileWidth}
                height={wrapTileHeight}
                preserveAspectRatio="xMidYMid meet"
              />
            )}
          </pattern>
          <clipPath id={`${rawId}-top-flap`}><path d={topFlapPath} /></clipPath>
          <clipPath id={`${rawId}-bottom-flap`}><path d={bottomFlapPath} /></clipPath>
          <clipPath id={`${rawId}-left-top-dust`}><polygon points={dustPoints(leftTopDust, true)} /></clipPath>
          <clipPath id={`${rawId}-right-top-dust`}><polygon points={dustPoints(rightTopDust, true)} /></clipPath>
          <clipPath id={`${rawId}-left-bottom-dust`}><polygon points={dustPoints(leftBottomDust, false)} /></clipPath>
          <clipPath id={`${rawId}-right-bottom-dust`}><polygon points={dustPoints(rightBottomDust, false)} /></clipPath>
          <clipPath id={`${rawId}-glue-tab`}><polygon points={gluePoints} /></clipPath>
          <style>{`
            .cut-shape,.cut-line{fill:none;stroke:#17231d;stroke-width:.35}
            .flap-fill{stroke:none}
            .fold-line{fill:none;stroke:#637168;stroke-width:.28;stroke-dasharray:2 1.3}
            .bleed-line{fill:none;stroke:#d56351;stroke-width:.22;stroke-dasharray:1.2 1.2}
            .safe-line{fill:none;stroke:#c7cec9;stroke-width:.2;stroke-dasharray:2 1.5}
            .scale-text{font:2.8px Arial,sans-serif;fill:#36453d}
          `}</style>
        </defs>

        <rect width={paper.width} height={paper.height} fill="#fff" />
        <g data-preview-guide="safe">
          <rect
            x={SAFE_MARGIN_MM}
            y={SAFE_MARGIN_MM}
            width={paper.width - SAFE_MARGIN_MM * 2}
            height={paper.height - SAFE_MARGIN_MM * 2}
            className="safe-line"
          />
        </g>

        <g id="artwork">
          {wrapArtwork?.fit === "repeat" && (
            <rect {...bodyRect} fill={`url(#${rawId}-wrap-pattern)`} />
          )}
          {wrapArtwork && wrapArtwork.fit !== "repeat" && (
            <ArtworkImage
              rect={bodyRect}
              artwork={wrapArtwork}
              clipId={`${rawId}-body-wrap`}
            />
          )}
          {faces.map(([face, rect]) => (
            useWrapArtwork && ["front", "back", "left", "right"].includes(face) ? null :
            <ArtworkImage
              key={face}
              rect={rect}
              artwork={imageForFace(face)}
              clipId={`${rawId}-${face}`}
            />
          ))}
          {faces.map(([face, rect]) => (
            (faceModes[face] ?? "image") === "text" &&
            !(useWrapArtwork && ["front", "back", "left", "right"].includes(face)) ? (
              <FaceText
                key={`text-${face}`}
                rect={rect}
                settings={faceText[face]}
                clipId={`${rawId}-${face}`}
              />
            ) : null
          ))}
        </g>

        <g id="flaps">
          <path
            d={`${topFlapPath} Z`}
            className="flap-fill"
            style={{ fill: colorFlaps ? imageForFace("top")?.dominantColor ?? "none" : "none" }}
          />
          {showPrintLines && <path d={topFlapPath} className="cut-shape" />}
          {g.bottomClosure === "tuck" && (
            <>
              <path
                d={`${bottomFlapPath} Z`}
                className="flap-fill"
                style={{ fill: colorFlaps ? imageForFace("bottom")?.dominantColor ?? "none" : "none" }}
              />
              {showPrintLines && <path d={bottomFlapPath} className="cut-shape" />}
            </>
          )}
          {bottomUnderFlap && (
            <>
              <path d={`${bottomUnderPath} Z`} className="flap-fill" style={{ fill: "#fff" }} />
              {showPrintLines && <path d={bottomUnderPath} className="cut-shape" />}
            </>
          )}
          <DustFlap {...leftTopDust} top showOutline={showPrintLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("left")?.dominantColor : undefined} />
          <DustFlap {...rightTopDust} top showOutline={showPrintLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("right")?.dominantColor : undefined} />
          <DustFlap {...leftBottomDust} top={false} showOutline={showPrintLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("left")?.dominantColor : undefined} />
          <DustFlap {...rightBottomDust} top={false} showOutline={showPrintLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("right")?.dominantColor : undefined} />
          <polygon
            points={gluePoints}
            className="flap-fill"
            style={{ fill: "#fff" }}
          />
          {showPrintLines && <polyline points={gluePoints} className="cut-shape" />}
        </g>

        <g id="cut-lines" style={{ display: showPrintLines ? undefined : "none" }}>
          <line x1={px} y1={py + g.bodyY} x2={px} y2={bodyBottom} className="cut-line" />
          <line x1={top.x} y1={top.y} x2={top.x} y2={py + g.bodyY} className="cut-line" />
          <line x1={top.x + top.width} y1={top.y} x2={top.x + top.width} y2={py + g.bodyY} className="cut-line" />
          <line x1={bottom.x} y1={bottom.y} x2={bottom.x} y2={bottom.y + bottom.height} className="cut-line" />
          <line x1={bottom.x + bottom.width} y1={bottom.y} x2={bottom.x + bottom.width} y2={bottom.y + bottom.height} className="cut-line" />
          {g.bottomClosure === "glued" && (
            <line
              x1={bottom.x}
              y1={bottom.y + bottom.height}
              x2={bottom.x + bottom.width}
              y2={bottom.y + bottom.height}
              className="cut-line"
            />
          )}
          {showThumbNotch ? (
            <path d={frontThumbNotchPath} className="cut-line" />
          ) : (
            <line
              x1={panels.front.x}
              y1={frontTopY}
              x2={panels.front.x + panels.front.width}
              y2={frontTopY}
              className="cut-line"
            />
          )}
          <line
            x1={top.x}
            y1={top.y}
            x2={top.x + reliefCutLength}
            y2={top.y}
            className="cut-line"
          />
          <line
            x1={top.x + top.width - reliefCutLength}
            y1={top.y}
            x2={top.x + top.width}
            y2={top.y}
            className="cut-line"
          />
          {g.bottomClosure === "tuck" && (
            <>
              <line x1={panels.front.x} y1={bodyBottom} x2={panels.front.x + panels.front.width} y2={bodyBottom} className="cut-line" />
              <line
                x1={bottom.x}
                y1={bottom.y + bottom.height}
                x2={bottom.x + reliefCutLength}
                y2={bottom.y + bottom.height}
                className="cut-line"
              />
              <line
                x1={bottom.x + bottom.width - reliefCutLength}
                y1={bottom.y + bottom.height}
                x2={bottom.x + bottom.width}
                y2={bottom.y + bottom.height}
                className="cut-line"
              />
            </>
          )}
        </g>

        <g id="fold-lines" style={{ display: showPrintLines ? undefined : "none" }}>
          {[panels.left.x, panels.front.x, panels.right.x, rightEdge].map((x) => (
            <line key={x} x1={x} y1={py + g.bodyY} x2={x} y2={bodyBottom} className="fold-line" />
          ))}
          {[panels.back, panels.left, panels.right].map((panel, index) => (
            <g key={`horizontal-${index}`}>
              <line x1={panel.x} y1={py + g.bodyY} x2={panel.x + panel.width} y2={py + g.bodyY} className="fold-line" />
              <line x1={panel.x} y1={bodyBottom} x2={panel.x + panel.width} y2={bodyBottom} className="fold-line" />
            </g>
          ))}
          <line x1={top.x} y1={top.y} x2={top.x + top.width} y2={top.y} className="fold-line" />
          {g.bottomClosure === "tuck" && (
            <line x1={bottom.x} y1={bottom.y + bottom.height} x2={bottom.x + bottom.width} y2={bottom.y + bottom.height} className="fold-line" />
          )}
          {bottomUnderFlap && (
            <line
              x1={bottomUnderFlap.x}
              y1={bottomUnderFlap.y}
              x2={bottomUnderFlap.x + bottomUnderFlap.width}
              y2={bottomUnderFlap.y}
              className="fold-line"
            />
          )}
        </g>

        <g id="bleed-guides" data-preview-guide="bleed" style={{ display: "none" }}>
          {faces.map(([face, rect]) => (
            <rect
              key={face}
              x={rect.x - BLEED_MM}
              y={rect.y - BLEED_MM}
              width={rect.width + BLEED_MM * 2}
              height={rect.height + BLEED_MM * 2}
              className="bleed-line"
            />
          ))}
        </g>

        <g id="scale-check">
          <line x1={SAFE_MARGIN_MM} y1={paper.height - 8} x2={SAFE_MARGIN_MM + 50} y2={paper.height - 8} className="cut-line" />
          {[0, 10, 20, 30, 40, 50].map((tick) => (
            <line
              key={tick}
              x1={SAFE_MARGIN_MM + tick}
              y1={paper.height - 9.5}
              x2={SAFE_MARGIN_MM + tick}
              y2={paper.height - 6.5}
              className="cut-line"
            />
          ))}
          <text x={SAFE_MARGIN_MM} y={paper.height - 3.5} className="scale-text">
            50 mm scale check
          </text>
        </g>
      </svg>
    );
  }
);

DielinePreview.displayName = "DielinePreview";
