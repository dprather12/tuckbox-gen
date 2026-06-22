import {
  forwardRef,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { BLEED_MM, MAX_FLAP_MM, SAFE_MARGIN_MM } from "../geometry";
import { ArtworkImage, FaceText } from "./FaceArtwork";
import type {
  ArtworkMap,
  ArtworkSettings,
  DielineGeometry,
  FaceModeMap,
  FaceName,
  Paper,
  Rect,
  TextMap
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
  onArtworkPositionChange: (
    target: FaceName | "wrap",
    offsetX: number,
    offsetY: number
  ) => void;
}

interface ArtworkDrag {
  pointerId: number;
  target: FaceName | "wrap";
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
  rect: Rect;
}

const clampOffset = (value: number) => Math.min(100, Math.max(-100, value));

function svgPoint(
  element: SVGGraphicsElement,
  clientX: number,
  clientY: number
): DOMPoint | undefined {
  const matrix = element.ownerSVGElement?.getScreenCTM();
  if (!matrix) return undefined;
  return new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
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

export const DielinePreview = forwardRef<SVGSVGElement, Props>(
  ({
    paper,
    geometry,
    artwork,
    faceModes,
    faceText,
    colorFlaps,
    showPrintLines,
    showThumbNotch,
    useWrapArtwork,
    wrapArtwork,
    onArtworkPositionChange
  }, ref) => {
    const rawId = useId().replace(/:/g, "");
    const dragRef = useRef<ArtworkDrag | undefined>(undefined);
    const [draggingTarget, setDraggingTarget] = useState<FaceName | "wrap">();
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
    const dustFlapDepth = Math.min(MAX_FLAP_MM, panels.left.width);
    const dustPoints = (rect: Rect, topSide: boolean) => {
      const inset = Math.min(rect.width * 0.2, 3);
      return topSide
        ? `${rect.x},${rect.y + rect.height} ${rect.x + inset},${rect.y} ${rect.x + rect.width - inset},${rect.y} ${rect.x + rect.width},${rect.y + rect.height}`
        : `${rect.x + rect.width},${rect.y} ${rect.x + rect.width - inset},${rect.y + rect.height} ${rect.x + inset},${rect.y + rect.height} ${rect.x},${rect.y}`;
    };
    const topDustY = py + g.bodyY - dustFlapDepth;
    const leftTopDust = { x: panels.left.x, y: topDustY, width: panels.left.width, height: dustFlapDepth };
    const rightTopDust = { x: panels.right.x, y: topDustY, width: panels.right.width, height: dustFlapDepth };
    const leftBottomDust = { x: panels.left.x, y: bodyBottom, width: panels.left.width, height: dustFlapDepth };
    const rightBottomDust = { x: panels.right.x, y: bodyBottom, width: panels.right.width, height: dustFlapDepth };
    const gluePoints = `${glueX},${py + g.bodyY} ${glueX + g.glueTab},${py + g.bodyY + 4} ${glueX + g.glueTab},${bodyBottom - 4} ${glueX},${bodyBottom}`;
    const imageForFace = (face: FaceName) =>
      (faceModes[face] ?? "image") === "image" ? artwork[face] : undefined;
    const draggableFaces = faces.filter(
      ([face]) =>
        !(useWrapArtwork && ["front", "back", "left", "right"].includes(face)) &&
        imageForFace(face)?.fit === "crop"
    );
    const beginArtworkDrag = (
      event: ReactPointerEvent<SVGRectElement>,
      target: FaceName | "wrap",
      rect: Rect,
      settings: ArtworkSettings
    ) => {
      if (event.button !== 0) return;
      const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        target,
        startX: point.x,
        startY: point.y,
        startOffsetX: settings.offsetX,
        startOffsetY: settings.offsetY,
        rect
      };
      setDraggingTarget(target);
    };
    const moveArtworkDrag = (event: ReactPointerEvent<SVGRectElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const point = svgPoint(event.currentTarget, event.clientX, event.clientY);
      if (!point) return;
      event.preventDefault();
      onArtworkPositionChange(
        drag.target,
        clampOffset(drag.startOffsetX + ((point.x - drag.startX) / drag.rect.width) * 200),
        clampOffset(drag.startOffsetY + ((point.y - drag.startY) / drag.rect.height) * 200)
      );
    };
    const endArtworkDrag = (event: ReactPointerEvent<SVGRectElement>) => {
      if (dragRef.current?.pointerId !== event.pointerId) return;
      dragRef.current = undefined;
      setDraggingTarget(undefined);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    };
    const reliefCutLength = Math.min(4, Math.max(2, g.tuckLip * 0.22));
    const frontTopY = py + g.bodyY;
    const frontCenterX = panels.front.x + panels.front.width / 2;
    const thumbNotchRadius = Math.min(7, Math.max(3.5, panels.front.width * 0.09));
    const frontThumbNotchPath =
      `M ${panels.front.x} ${frontTopY} ` +
      `H ${frontCenterX - thumbNotchRadius} ` +
      `A ${thumbNotchRadius} ${thumbNotchRadius} 0 0 0 ${frontCenterX + thumbNotchRadius} ${frontTopY} ` +
      `H ${panels.front.x + panels.front.width}`;
    // Replace the SVG node when its geometry changes. Chromium can otherwise
    // retain stale pixels for moved strokes when raster images and the
    // preview's drop-shadow compositing layer are both present.
    const geometryKey = [
      paper.width,
      paper.height,
      g.totalWidth,
      g.totalHeight,
      g.bodyY,
      g.pageX,
      g.pageY,
      g.bottomClosure
    ].join("-");

    return (
      <svg
        key={geometryKey}
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
            .artwork-drag-handle{fill:transparent;stroke:transparent;stroke-width:.8;cursor:grab;touch-action:none}
            .artwork-drag-handle:hover{stroke:#c99e56;stroke-dasharray:2 1}
            .artwork-drag-handle.dragging{stroke:#806331;stroke-dasharray:2 1;cursor:grabbing}
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
          {[
            { name: "back-left", x: panels.left.x },
            { name: "left-front", x: panels.front.x },
            { name: "front-right", x: panels.right.x },
            { name: "right-glue", x: rightEdge }
          ].map(({ name, x }) => (
            <line key={name} x1={x} y1={py + g.bodyY} x2={x} y2={bodyBottom} className="fold-line" />
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

        <g data-preview-only="artwork-drag-handles" aria-hidden="true">
          {useWrapArtwork && wrapArtwork?.fit === "crop" && (
            <rect
              {...bodyRect}
              className={`artwork-drag-handle${draggingTarget === "wrap" ? " dragging" : ""}`}
              onPointerDown={(event) => beginArtworkDrag(event, "wrap", bodyRect, wrapArtwork)}
              onPointerMove={moveArtworkDrag}
              onPointerUp={endArtworkDrag}
              onPointerCancel={endArtworkDrag}
              onLostPointerCapture={endArtworkDrag}
            />
          )}
          {draggableFaces.map(([face, rect]) => {
            const settings = imageForFace(face)!;
            return (
              <rect
                {...rect}
                key={face}
                className={`artwork-drag-handle${draggingTarget === face ? " dragging" : ""}`}
                onPointerDown={(event) => beginArtworkDrag(event, face, rect, settings)}
                onPointerMove={moveArtworkDrag}
                onPointerUp={endArtworkDrag}
                onPointerCancel={endArtworkDrag}
                onLostPointerCapture={endArtworkDrag}
              />
            );
          })}
        </g>
      </svg>
    );
  }
);

DielinePreview.displayName = "DielinePreview";
