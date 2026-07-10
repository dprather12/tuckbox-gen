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
  FaceContentMode,
  FaceModeMap,
  FaceName,
  FaceOpacityMap,
  Paper,
  Rect,
  TextMap,
  TextSettings
} from "../types";

interface Props {
  paper: Paper;
  geometry: DielineGeometry;
  copyGeometries?: DielineGeometry[];
  artwork: ArtworkMap;
  faceModes: FaceModeMap;
  faceText: TextMap;
  colorFlaps: boolean;
  hideCutLines: boolean;
  hideFoldLines: boolean;
  lineOpacity: number;
  lineThickness: number;
  thumbNotchSize: number;
  tuckFlapChamfer: number;
  showThumbNotch: boolean;
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
  wrapMode: FaceContentMode;
  wrapText?: TextSettings;
  masterOpacity: number;
  faceOpacities: FaceOpacityMap;
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
  lockingSide,
  fill,
  showOutline
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  top: boolean;
  lockingSide?: "left" | "right";
  fill?: string;
  showOutline: boolean;
}) {
  const inset = Math.min(width * 0.2, 3);
  const shoulder = top && lockingSide
    ? Math.min(height * 0.28, Math.max(2, height * 0.16))
    : 0;
  const pointPairs = top
    ? [
        [x, y + height],
        ...(lockingSide === "left" ? [[x, y + height - shoulder]] : []),
        [x + inset, y],
        [x + width - inset, y],
        ...(lockingSide === "right" ? [[x + width, y + height - shoulder]] : []),
        [x + width, y + height]
      ]
    : [
        [x + width, y],
        [x + width - inset, y + height],
        [x + inset, y + height],
        [x, y]
      ];
  const points = pointPairs.map(([px, py]) => `${px},${py}`).join(" ");
  const cutStyle = { display: showOutline ? undefined : "none" };
  const cutSegments = pointPairs.slice(0, -1).map(([x1, y1], index) => {
    const [x2, y2] = pointPairs[(index + 1) % pointPairs.length];
    return [x1, y1, x2, y2];
  });

  return (
    <g>
      <polygon points={points} className="flap-fill" data-export-layer="flap-fill" style={{ fill: fill ?? "none" }} />
      {cutSegments.map(([x1, y1, x2, y2], index) => (
        <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} className="cut-shape" style={cutStyle} />
      ))}
    </g>
  );
}

export const DielinePreview = forwardRef<SVGSVGElement, Props>(
  ({
    paper,
    geometry,
    copyGeometries = [],
    artwork,
    faceModes,
    faceText,
    colorFlaps,
    hideCutLines,
    hideFoldLines,
    lineOpacity,
    lineThickness,
    thumbNotchSize,
    tuckFlapChamfer,
    showThumbNotch,
    useWrapArtwork,
    wrapArtwork,
    wrapMode,
    wrapText,
    masterOpacity,
    faceOpacities,
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
    const bodyLeft = panels.back.x;
    const rightEdge = panels.right.x + panels.right.width;
    const glueX = bodyLeft;
    const bodyRect = {
      x: bodyLeft,
      y: py + g.bodyY,
      width: rightEdge - bodyLeft,
      height: panels.back.height
    };
    const wrapTileHeight = bodyRect.height;
    const wrapTileWidth =
      wrapArtwork?.imageWidth && wrapArtwork.imageHeight
        ? wrapTileHeight * (wrapArtwork.imageWidth / wrapArtwork.imageHeight)
        : wrapTileHeight;
    const buildTuckFlapPath = (
      rect: Rect,
      baseY: number,
      tuckLip: number,
      chamfer: number,
      direction: 1 | -1
    ) => {
      const edgeOffset = tuckLip * 0.35;
      const c = Math.min(Math.max(chamfer, 0), edgeOffset, rect.width / 2);
      const edgeY = baseY + direction * edgeOffset;
      const tipY = baseY + direction * tuckLip;
      const rightX = rect.x + rect.width;
      const leftX = rect.x;
      const midX = rect.x + rect.width / 2;
      const start = c > 0 ? `M ${rightX - c} ${baseY} L ${rightX} ${baseY + direction * c}` : `M ${rightX} ${baseY}`;
      const end = c > 0 ? `L ${leftX} ${baseY + direction * c} L ${leftX + c} ${baseY}` : `L ${leftX} ${baseY}`;
      return `${start} L ${rightX} ${edgeY} Q ${midX} ${tipY} ${leftX} ${edgeY} ${end}`;
    };
    const topFlapPath = buildTuckFlapPath(top, top.y, g.tuckLip, tuckFlapChamfer, -1);
    const bottomFlapPath = buildTuckFlapPath(bottom, bottom.y + bottom.height, g.tuckLip, tuckFlapChamfer, 1);
    const bottomUnderPath = bottomUnderFlap
      ? `M ${bottomUnderFlap.x} ${bottomUnderFlap.y} L ${bottomUnderFlap.x + 3} ${bottomUnderFlap.y + bottomUnderFlap.height} L ${bottomUnderFlap.x + bottomUnderFlap.width - 3} ${bottomUnderFlap.y + bottomUnderFlap.height} L ${bottomUnderFlap.x + bottomUnderFlap.width} ${bottomUnderFlap.y}`
      : "";
    const dustFlapDepth = Math.min(MAX_FLAP_MM, panels.left.width);
    const dustPoints = (rect: Rect, topSide: boolean, lockingSide?: "left" | "right") => {
      const inset = Math.min(rect.width * 0.2, 3);
      const shoulder = topSide && lockingSide
        ? Math.min(rect.height * 0.28, Math.max(2, rect.height * 0.16))
        : 0;
      const points = topSide
        ? [
            [rect.x, rect.y + rect.height],
            ...(lockingSide === "left" ? [[rect.x, rect.y + rect.height - shoulder]] : []),
            [rect.x + inset, rect.y],
            [rect.x + rect.width - inset, rect.y],
            ...(lockingSide === "right" ? [[rect.x + rect.width, rect.y + rect.height - shoulder]] : []),
            [rect.x + rect.width, rect.y + rect.height]
          ]
        : [
            [rect.x + rect.width, rect.y],
            [rect.x + rect.width - inset, rect.y + rect.height],
            [rect.x + inset, rect.y + rect.height],
            [rect.x, rect.y]
          ];
      return points.map(([px, py]) => `${px},${py}`).join(" ");
    };
    const topDustY = py + g.bodyY - dustFlapDepth;
    const leftTopDust = { x: panels.left.x, y: topDustY, width: panels.left.width, height: dustFlapDepth };
    const rightTopDust = { x: panels.right.x, y: topDustY, width: panels.right.width, height: dustFlapDepth };
    const leftBottomDust = { x: panels.left.x, y: bodyBottom, width: panels.left.width, height: dustFlapDepth };
    const rightBottomDust = { x: panels.right.x, y: bodyBottom, width: panels.right.width, height: dustFlapDepth };
    const gluePoints = `${glueX},${py + g.bodyY} ${glueX - g.glueTab},${py + g.bodyY + 4} ${glueX - g.glueTab},${bodyBottom - 4} ${glueX},${bodyBottom}`;
    const imageForFace = (face: FaceName) =>
      (faceModes[face] ?? "image") === "image" ? artwork[face] : undefined;
    const glueFill =
      colorFlaps || hideCutLines
        ? wrapArtwork?.dominantColor ?? imageForFace("back")?.dominantColor ?? "#fff"
        : "#fff";
    const opacityForFace = (face: FaceName) =>
      (masterOpacity / 100) * ((faceOpacities[face] ?? 100) / 100);
    const draggableFaces = faces.filter(
      ([face]) => imageForFace(face)?.fit === "crop"
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
        drag.startOffsetX + ((point.x - drag.startX) / drag.rect.width) * 200,
        drag.startOffsetY + ((point.y - drag.startY) / drag.rect.height) * 200
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
    const showCutLines = !hideCutLines;
    const showFoldLines = !hideFoldLines;
    const cutLineWidth = Number(lineThickness.toFixed(3));
    const foldLineWidth = Number((lineThickness * 0.8).toFixed(3));
    const lineStrokeOpacity = Number((lineOpacity / 100).toFixed(2));
    const reliefCutLength = Math.min(4, Math.max(2, g.tuckLip * 0.22));
    const topReliefCutLength = Math.min(6, Math.max(3, g.tuckLip * 0.3));
    const frontTopY = py + g.bodyY;
    const frontCenterX = panels.front.x + panels.front.width / 2;
    const thumbNotchRadius = Math.min(panels.front.width / 2, Math.max(0.5, thumbNotchSize));
    const frontThumbNotchPath =
      `M ${panels.front.x} ${frontTopY} ` +
      `H ${frontCenterX - thumbNotchRadius} ` +
      `A ${thumbNotchRadius} ${thumbNotchRadius} 0 0 0 ${frontCenterX + thumbNotchRadius} ${frontTopY} ` +
      `H ${panels.front.x + panels.front.width}`;
    const frontFaceClipPath =
      showThumbNotch
        ? `M ${panels.front.x} ${frontTopY} ` +
          `H ${frontCenterX - thumbNotchRadius} ` +
          `A ${thumbNotchRadius} ${thumbNotchRadius} 0 0 0 ${frontCenterX + thumbNotchRadius} ${frontTopY} ` +
          `H ${panels.front.x + panels.front.width} ` +
          `V ${panels.front.y + panels.front.height} ` +
          `H ${panels.front.x} Z`
        : undefined;
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
              {face === "front" && frontFaceClipPath ? <path d={frontFaceClipPath} /> : <rect {...rect} />}
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
          <clipPath id={`${rawId}-left-top-dust`}><polygon points={dustPoints(leftTopDust, true, "right")} /></clipPath>
          <clipPath id={`${rawId}-right-top-dust`}><polygon points={dustPoints(rightTopDust, true, "left")} /></clipPath>
          <clipPath id={`${rawId}-left-bottom-dust`}><polygon points={dustPoints(leftBottomDust, false)} /></clipPath>
          <clipPath id={`${rawId}-right-bottom-dust`}><polygon points={dustPoints(rightBottomDust, false)} /></clipPath>
          <clipPath id={`${rawId}-glue-tab`}><polygon points={gluePoints} /></clipPath>
          <style>{`
            .cut-shape,.cut-line{fill:none;stroke:#17231d;stroke-width:${cutLineWidth};stroke-opacity:${lineStrokeOpacity}}
            .flap-fill{stroke:none}
            .fold-line{fill:none;stroke:#637168;stroke-width:${foldLineWidth};stroke-opacity:${lineStrokeOpacity};stroke-dasharray:2 1.3}
            .bleed-line{fill:none;stroke:#d56351;stroke-width:.22;stroke-dasharray:1.2 1.2}
            .safe-line{fill:none;stroke:#c7cec9;stroke-width:.2;stroke-dasharray:2 1.5}
            .artwork-drag-handle{fill:transparent;stroke:transparent;stroke-width:.8;cursor:grab;touch-action:none}
            .artwork-drag-handle:hover{stroke:#c99e56;stroke-dasharray:2 1}
            .artwork-drag-handle.dragging{stroke:#806331;stroke-dasharray:2 1;cursor:grabbing}
          `}</style>
        </defs>

        <rect width={paper.width} height={paper.height} fill="#fff" data-export-layer="page-background" />
        <g data-preview-guide="safe">
          <rect
            x={SAFE_MARGIN_MM}
            y={SAFE_MARGIN_MM}
            width={paper.width - SAFE_MARGIN_MM * 2}
            height={paper.height - SAFE_MARGIN_MM * 2}
            className="safe-line"
          />
        </g>

        <g id={`${rawId}-dieline-copy`}>
        <g data-export-layer="cricut-silhouette" style={{ display: "none" }}>
          {faces.map(([face, rect]) => (
            face === "front" && frontFaceClipPath
              ? <path key={face} d={frontFaceClipPath} />
              : <rect key={face} {...rect} />
          ))}
          <path d={`${topFlapPath} Z`} />
          {g.bottomClosure === "tuck" && <path d={`${bottomFlapPath} Z`} />}
          {bottomUnderFlap && <path d={`${bottomUnderPath} Z`} />}
          <polygon points={dustPoints(leftTopDust, true, "right")} />
          <polygon points={dustPoints(rightTopDust, true, "left")} />
          <polygon points={dustPoints(leftBottomDust, false)} />
          <polygon points={dustPoints(rightBottomDust, false)} />
          <polygon points={gluePoints} />
        </g>
        <g id="artwork" data-export-layer="artwork">
          {useWrapArtwork && wrapArtwork?.fit === "repeat" && (
            faces
              .filter(([face]) => ["front", "back", "left", "right"].includes(face))
              .map(([face, rect]) => (
                <rect
                  key={`wrap-repeat-${face}`}
                  {...rect}
                  fill={`url(#${rawId}-wrap-pattern)`}
                  clipPath={`url(#${rawId}-${face})`}
                  opacity={opacityForFace(face)}
                />
              ))
          )}
          {useWrapArtwork && wrapArtwork && wrapArtwork.fit !== "repeat" && (
            faces
              .filter(([face]) => ["front", "back", "left", "right"].includes(face))
              .map(([face]) => (
                <ArtworkImage
                  key={`wrap-${face}`}
                  rect={bodyRect}
                  artwork={wrapArtwork}
                  clipId={`${rawId}-${face}`}
                  opacity={opacityForFace(face)}
                />
              ))
          )}
          {wrapMode === "text" && (
            <FaceText
              rect={bodyRect}
              settings={wrapText}
              clipId={`${rawId}-body-wrap`}
              opacity={masterOpacity / 100}
            />
          )}
          {faces.map(([face, rect]) => (
            <ArtworkImage
              key={face}
              rect={rect}
              artwork={imageForFace(face)}
              clipId={`${rawId}-${face}`}
              opacity={opacityForFace(face)}
            />
          ))}
          {faces.map(([face, rect]) => (
            (faceModes[face] ?? "image") === "text" ? (
              <FaceText
                key={`text-${face}`}
                rect={rect}
                settings={faceText[face]}
                clipId={`${rawId}-${face}`}
                opacity={opacityForFace(face)}
              />
            ) : null
          ))}
        </g>

        <g id="flaps">
          <path
            d={`${topFlapPath} Z`}
            className="flap-fill"
            data-export-layer="flap-fill"
            style={{ fill: colorFlaps ? imageForFace("top")?.dominantColor ?? "none" : "none" }}
          />
          <path d={topFlapPath} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
          {g.bottomClosure === "tuck" && (
            <>
              <path
                d={`${bottomFlapPath} Z`}
                className="flap-fill"
                data-export-layer="flap-fill"
                style={{ fill: colorFlaps ? imageForFace("bottom")?.dominantColor ?? "none" : "none" }}
              />
              <path d={bottomFlapPath} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
            </>
          )}
          {bottomUnderFlap && (
            <>
              <path d={`${bottomUnderPath} Z`} className="flap-fill" data-export-layer="flap-fill" style={{ fill: "#fff" }} />
              <path d={bottomUnderPath} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
            </>
          )}
          <DustFlap {...leftTopDust} top lockingSide="right" showOutline={showCutLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("left")?.dominantColor : undefined} />
          <DustFlap {...rightTopDust} top lockingSide="left" showOutline={showCutLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("right")?.dominantColor : undefined} />
          <DustFlap {...leftBottomDust} top={false} showOutline={showCutLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("left")?.dominantColor : undefined} />
          <DustFlap {...rightBottomDust} top={false} showOutline={showCutLines} fill={colorFlaps ? wrapArtwork?.dominantColor ?? imageForFace("right")?.dominantColor : undefined} />
          <polygon
            points={gluePoints}
            className="flap-fill"
            data-export-layer="flap-fill"
            style={{ fill: glueFill }}
          />
          <line x1={glueX} y1={py + g.bodyY} x2={glueX - g.glueTab} y2={py + g.bodyY + 4} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
          <line x1={glueX - g.glueTab} y1={py + g.bodyY + 4} x2={glueX - g.glueTab} y2={bodyBottom - 4} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
          <line x1={glueX - g.glueTab} y1={bodyBottom - 4} x2={glueX} y2={bodyBottom} className="cut-shape" style={{ display: showCutLines ? undefined : "none" }} />
        </g>

        <g id="cut-lines" data-export-layer="cut-lines" style={{ display: showCutLines ? undefined : "none" }}>
          <line x1={px} y1={py + g.bodyY + 4} x2={px} y2={bodyBottom - 4} className="cut-line" />
          <line x1={rightEdge} y1={py + g.bodyY} x2={rightEdge} y2={bodyBottom} className="cut-line" />
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
            x2={top.x + topReliefCutLength}
            y2={top.y}
            className="cut-line"
            data-export-layer="cricut-internal-cut"
            style={{ strokeWidth: 1 }}
          />
          <line
            x1={top.x + top.width - topReliefCutLength}
            y1={top.y}
            x2={top.x + top.width}
            y2={top.y}
            className="cut-line"
            data-export-layer="cricut-internal-cut"
            style={{ strokeWidth: 1 }}
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
                data-export-layer="cricut-internal-cut"
              />
              <line
                x1={bottom.x + bottom.width - reliefCutLength}
                y1={bottom.y + bottom.height}
                x2={bottom.x + bottom.width}
                y2={bottom.y + bottom.height}
                className="cut-line"
                data-export-layer="cricut-internal-cut"
              />
            </>
          )}
        </g>

        <g id="fold-lines" data-export-layer="fold-lines" style={{ display: showFoldLines ? undefined : "none" }}>
          {[
            { name: "glue-back", x: panels.back.x },
            { name: "back-left", x: panels.left.x },
            { name: "left-front", x: panels.front.x },
            { name: "front-right", x: panels.right.x }
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
        </g>

        {copyGeometries.map((copy, index) => (
          <use
            key={`${copy.pageX}-${copy.pageY}`}
            href={`#${rawId}-dieline-copy`}
            transform={`translate(${copy.pageX - g.pageX} ${copy.pageY - g.pageY})`}
            aria-label={`Tuckbox copy ${index + 2}`}
          />
        ))}

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
