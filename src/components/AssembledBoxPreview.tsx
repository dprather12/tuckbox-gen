import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type {
  ArtworkMap,
  ArtworkSettings,
  BoxDimensions,
  FaceModeMap,
  FaceName,
  FaceOpacityMap,
  Rect,
  TextMap
} from "../types";
import { ArtworkImage, FaceText } from "./FaceArtwork";

interface Props {
  dimensions: BoxDimensions;
  artwork: ArtworkMap;
  faceModes: FaceModeMap;
  faceText: TextMap;
  showThumbNotch: boolean;
  thumbNotchSize: number;
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
  masterOpacity: number;
  faceOpacities: FaceOpacityMap;
}

const DEFAULT_ROTATION = { x: -18, y: 30 };
const MIN_TILT = -55;
const MAX_TILT = 35;
const FACE_RASTER_SCALE = 3;
const MINI_STAGE_FALLBACK = { width: 150, height: 100 };
const LARGE_STAGE_FALLBACK = { width: 860, height: 560 };
const STAGE_PADDING = {
  mini: { x: 88, y: 84 },
  large: { x: 210, y: 190 }
};
export function clampPreviewTilt(value: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, value));
}

function getProjectedBoxSize(
  dimensions: BoxDimensions,
  rotation: { x: number; y: number }
): { width: number; height: number } {
  const xRadians = (rotation.x * Math.PI) / 180;
  const yRadians = (rotation.y * Math.PI) / 180;
  const sinX = Math.sin(xRadians);
  const cosX = Math.cos(xRadians);
  const sinY = Math.sin(yRadians);
  const cosY = Math.cos(yRadians);
  const xValues: number[] = [];
  const yValues: number[] = [];

  [-dimensions.width / 2, dimensions.width / 2].forEach((x) => {
    [-dimensions.height / 2, dimensions.height / 2].forEach((y) => {
      [-dimensions.depth / 2, dimensions.depth / 2].forEach((z) => {
        const rotatedY = y * cosX - z * sinX;
        const rotatedZ = y * sinX + z * cosX;
        const rotatedX = x * cosY + rotatedZ * sinY;
        xValues.push(rotatedX);
        yValues.push(rotatedY);
      });
    });
  });

  return {
    width: Math.max(...xValues) - Math.min(...xValues),
    height: Math.max(...yValues) - Math.min(...yValues)
  };
}

function clippedFacePath(
  context: CanvasRenderingContext2D,
  face: FaceName,
  width: number,
  height: number,
  showThumbNotch: boolean,
  thumbNotchSize: number
) {
  context.beginPath();
  if (face !== "front" || !showThumbNotch) {
    context.rect(0, 0, width, height);
    return;
  }

  const notchRadius = Math.min(width / 2, Math.max(0.5, thumbNotchSize));
  const centerX = width / 2;
  context.moveTo(0, 0);
  context.lineTo(centerX - notchRadius, 0);
  context.arc(centerX, 0, notchRadius, Math.PI, 0, true);
  context.lineTo(width, 0);
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
}

function drawArtworkImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  artwork: ArtworkSettings,
  rect: Rect
) {
  if (artwork.backgroundColor) {
    context.fillStyle = artwork.backgroundColor;
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  if (artwork.fit === "stretch") {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    return;
  }

  if (artwork.fit === "repeat") {
    const tileHeight = rect.height;
    const tileWidth = image.naturalWidth && image.naturalHeight
      ? tileHeight * (image.naturalWidth / image.naturalHeight)
      : tileHeight;
    for (let x = rect.x; x < rect.x + rect.width; x += tileWidth) {
      context.drawImage(image, x, rect.y, tileWidth, tileHeight);
    }
    return;
  }

  const targetRatio = rect.width / rect.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const sourceWidth = imageRatio > targetRatio
    ? image.naturalHeight * targetRatio
    : image.naturalWidth;
  const sourceHeight = imageRatio > targetRatio
    ? image.naturalHeight
    : image.naturalWidth / targetRatio;
  const zoom = Math.max(artwork.zoom || 1, 0.01);
  const visibleSourceWidth = sourceWidth / zoom;
  const visibleSourceHeight = sourceHeight / zoom;
  const sourceX =
    (image.naturalWidth - visibleSourceWidth) / 2 -
    (artwork.offsetX / 100) * visibleSourceWidth * 0.5;
  const sourceY =
    (image.naturalHeight - visibleSourceHeight) / 2 -
    (artwork.offsetY / 100) * visibleSourceHeight * 0.5;

  context.drawImage(
    image,
    Math.max(0, Math.min(image.naturalWidth - visibleSourceWidth, sourceX)),
    Math.max(0, Math.min(image.naturalHeight - visibleSourceHeight, sourceY)),
    visibleSourceWidth,
    visibleSourceHeight,
    rect.x,
    rect.y,
    rect.width,
    rect.height
  );
}

function FaceCanvas({
  face,
  width,
  height,
  pixelScale,
  faceResolutionScale,
  artwork,
  showThumbNotch,
  thumbNotchSize,
  opacity
}: {
  face: FaceName;
  width: number;
  height: number;
  pixelScale: number;
  faceResolutionScale: number;
  artwork?: ArtworkSettings;
  showThumbNotch: boolean;
  thumbNotchSize: number;
  opacity: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !artwork) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const bitmapWidth = Math.max(
        1,
        Math.ceil(width * pixelScale * faceResolutionScale * FACE_RASTER_SCALE)
      );
      const bitmapHeight = Math.max(
        1,
        Math.ceil(height * pixelScale * faceResolutionScale * FACE_RASTER_SCALE)
      );
      canvas.width = bitmapWidth;
      canvas.height = bitmapHeight;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.clearRect(0, 0, bitmapWidth, bitmapHeight);
      context.scale(bitmapWidth / width, bitmapHeight / height);
      clippedFacePath(context, face, width, height, showThumbNotch, thumbNotchSize);
      context.clip();
      drawArtworkImage(context, image, artwork, { x: 0, y: 0, width, height });
    };
    image.src = artwork.src;

    return () => {
      cancelled = true;
    };
  }, [artwork, face, faceResolutionScale, height, pixelScale, showThumbNotch, thumbNotchSize, width]);

  if (!artwork) return null;

  return (
    <canvas
      ref={canvasRef}
      className="assembled-face-canvas"
      aria-hidden="true"
      style={{ opacity }}
    />
  );
}

function FaceSvg({
  face,
  width,
  height,
  pixelScale,
  artwork,
  faceModes,
  faceText,
  showThumbNotch,
  thumbNotchSize,
  useWrapArtwork,
  wrapArtwork,
  wrapRect,
  wrapViewX,
  opacity,
  rawId,
  rasterizedArtwork
}: {
  face: FaceName;
  width: number;
  height: number;
  pixelScale: number;
  artwork: ArtworkMap;
  faceModes: FaceModeMap;
  faceText: TextMap;
  showThumbNotch: boolean;
  thumbNotchSize: number;
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
  wrapRect: Rect;
  wrapViewX: number;
  opacity: number;
  rawId: string;
  rasterizedArtwork: boolean;
}) {
  const localRect = { x: 0, y: 0, width, height };
  const clipId = `${rawId}-${face}-clip`;
  const wrapClipId = `${rawId}-${face}-wrap-clip`;
  const patternId = `${rawId}-${face}-wrap-pattern`;
  const isBody = face === "front" || face === "back" || face === "left" || face === "right";
  const usesWrap = isBody && useWrapArtwork && Boolean(wrapArtwork);
  const notchRadius = Math.min(width / 2, Math.max(0.5, thumbNotchSize));
  const centerX = width / 2;
  const facePath = face === "front" && showThumbNotch
    ? `M 0 0 H ${centerX - notchRadius} A ${notchRadius} ${notchRadius} 0 0 0 ${centerX + notchRadius} 0 H ${width} V ${height} H 0 Z`
    : `M 0 0 H ${width} V ${height} H 0 Z`;
  const wrapTileWidth =
    wrapArtwork?.imageWidth && wrapArtwork.imageHeight
      ? height * (wrapArtwork.imageWidth / wrapArtwork.imageHeight)
      : height;
  const orientationTransform =
    face === "bottom" ? `rotate(180 ${width / 2} ${height / 2})` : undefined;
  const intrinsicScale = 3;
  const intrinsicWidth = Math.max(1, Math.ceil(width * pixelScale * intrinsicScale));
  const intrinsicHeight = Math.max(1, Math.ceil(height * pixelScale * intrinsicScale));

  return (
    <svg
      className="assembled-face-art"
      viewBox={`0 0 ${width} ${height}`}
      width={intrinsicWidth}
      height={intrinsicHeight}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <defs>
        <clipPath id={clipId}><path d={facePath} /></clipPath>
        <clipPath id={wrapClipId}><rect {...wrapRect} /></clipPath>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          x={-wrapViewX}
          y="0"
          width={wrapTileWidth}
          height={height}
        >
          {wrapArtwork && (
            <image
              href={wrapArtwork.src}
              width={wrapTileWidth}
              height={height}
              preserveAspectRatio="xMidYMid meet"
            />
          )}
        </pattern>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {!rasterizedArtwork && <rect width={width} height={height} fill="#fff" />}
        <g transform={orientationTransform}>
          {!rasterizedArtwork && usesWrap && wrapArtwork?.fit === "repeat" && (
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill={`url(#${patternId})`}
              opacity={opacity}
            />
          )}
          {!rasterizedArtwork && usesWrap && wrapArtwork?.fit !== "repeat" && (
            <g transform={`translate(${-wrapViewX} 0)`}>
              <ArtworkImage
                rect={wrapRect}
                artwork={wrapArtwork}
                clipId={wrapClipId}
                opacity={opacity}
              />
            </g>
          )}
          {!rasterizedArtwork && !usesWrap && (faceModes[face] ?? "image") === "image" && (
            <ArtworkImage
              rect={localRect}
              artwork={artwork[face]}
              clipId={clipId}
              opacity={opacity}
            />
          )}
          {!usesWrap && (faceModes[face] ?? "image") === "text" && (
            <FaceText rect={localRect} settings={faceText[face]} clipId={clipId} opacity={opacity} />
          )}
        </g>
        <rect width={width} height={height} className="assembled-face-shade" />
        <path d={facePath} className="assembled-face-edge" />
      </g>
    </svg>
  );
}

export function AssembledBoxPreview({
  dimensions,
  artwork,
  faceModes,
  faceText,
  showThumbNotch,
  thumbNotchSize,
  useWrapArtwork,
  wrapArtwork,
  masterOpacity,
  faceOpacities
}: Props) {
  const rawId = useId().replace(/:/g, "");
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [stageSizes, setStageSizes] = useState({
    mini: MINI_STAGE_FALLBACK,
    large: LARGE_STAGE_FALLBACK
  });
  const miniStageRef = useRef<HTMLDivElement | null>(null);
  const largeStageRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const dragged = useRef(false);
  const { width, depth, height } = dimensions;
  const perimeter = 2 * width + 2 * depth;
  const wrapRect = useMemo(
    () => ({ x: 0, y: 0, width: perimeter, height }),
    [height, perimeter]
  );
  const wrapOffsets: Record<FaceName, number> = useMemo(
    () => ({
      back: 0,
      left: width,
      front: width + depth,
      right: 2 * width + depth,
      top: 0,
      bottom: 0
    }),
    [depth, width]
  );
  const faceSizes: Record<FaceName, { width: number; height: number }> = useMemo(
    () => ({
      front: { width, height },
      back: { width, height },
      left: { width: depth, height },
      right: { width: depth, height },
      top: { width, height: depth },
      bottom: { width, height: depth }
    }),
    [depth, height, width]
  );
  const opacityForFace = (face: FaceName) =>
    (masterOpacity / 100) * ((faceOpacities[face] ?? 100) / 100);
  const rasterArtworkByFace = useMemo(() => {
    const next: Partial<Record<FaceName, ArtworkSettings>> = {};
    (Object.keys(faceSizes) as FaceName[]).forEach((face) => {
      const isBody = face === "front" || face === "back" || face === "left" || face === "right";
      if (isBody && useWrapArtwork && wrapArtwork) {
        if (wrapArtwork.fit === "repeat") {
          next[face] = wrapArtwork;
          return;
        }
        const faceSize = faceSizes[face];
        next[face] = {
          ...wrapArtwork,
          offsetX:
            wrapArtwork.offsetX +
            ((wrapRect.width / 2 - wrapOffsets[face] - faceSize.width / 2) / faceSize.width) * 200,
          offsetY: wrapArtwork.offsetY,
          zoom: wrapArtwork.zoom * (wrapRect.width / faceSize.width)
        };
        return;
      }
      if ((faceModes[face] ?? "image") === "image") next[face] = artwork[face];
    });
    return next;
  }, [artwork, faceModes, faceSizes, useWrapArtwork, wrapArtwork, wrapOffsets, wrapRect.width]);
  const moveRotation = (deltaX: number, deltaY: number) => {
    setRotation((current) => ({
      x: clampPreviewTilt(current.x - deltaY),
      y: current.y + deltaX
    }));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    dragged.current = false;
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.current.x;
    const deltaY = event.clientY - drag.current.y;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 2) dragged.current = true;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    moveRotation(deltaX * 0.45, deltaY * 0.45);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = undefined;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && event.currentTarget.classList.contains("assembled-stage-mini")) {
      event.preventDefault();
      setExpanded(true);
      return;
    }
    const movement: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-5, 0],
      ArrowRight: [5, 0],
      ArrowUp: [0, -5],
      ArrowDown: [0, 5]
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    moveRotation(delta[0], delta[1]);
  };

  useEffect(() => {
    const observers: ResizeObserver[] = [];
    const observeStage = (key: "mini" | "large", node: HTMLDivElement | null) => {
      if (!node) return;
      const updateSize = () => {
        setStageSizes((current) => ({
          ...current,
          [key]: {
            width: node.clientWidth || current[key].width,
            height: node.clientHeight || current[key].height
          }
        }));
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(node);
      observers.push(observer);
    };

    observeStage("mini", miniStageRef.current);
    observeStage("large", largeStageRef.current);

    return () => observers.forEach((observer) => observer.disconnect());
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", handleEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  const renderStage = (large = false) => {
    const stageKey = large ? "large" : "mini";
    const faceResolutionScale = large ? 3 : 2;
    const stageSize = stageSizes[stageKey];
    const padding = STAGE_PADDING[stageKey];
    const projectedBoxSize = getProjectedBoxSize(dimensions, DEFAULT_ROTATION);
    const scale = Math.min(
      Math.max(1, stageSize.width - padding.x) / Math.max(1, projectedBoxSize.width),
      Math.max(1, stageSize.height - padding.y) / Math.max(1, projectedBoxSize.height)
    );
    const style = {
      "--box-width": `${width * scale}px`,
      "--box-depth": `${depth * scale}px`,
      "--box-height": `${height * scale}px`,
      "--face-resolution-scale": faceResolutionScale,
      "--face-resolution-inverse": 1 / faceResolutionScale,
      transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`
    } as CSSProperties;

    return (
      <div
        ref={large ? largeStageRef : miniStageRef}
        className={`assembled-stage${large ? " assembled-stage-large" : " assembled-stage-mini"}${isDragging ? " is-dragging" : ""}`}
        tabIndex={0}
        role="img"
        aria-label="Interactive assembled tuckbox preview"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (!large && !dragged.current) setExpanded(true);
        }}
      >
        <div className="assembled-ground-shadow" />
        <div className="assembled-box" style={style} data-rotation-x={rotation.x} data-rotation-y={rotation.y}>
          {(Object.keys(faceSizes) as FaceName[]).map((face) => {
            const rasterArtwork = rasterArtworkByFace[face];
            return (
              <div className={`assembled-face assembled-face-${face}`} key={face} data-face={face}>
                <FaceCanvas
                  face={face}
                  {...faceSizes[face]}
                  pixelScale={scale}
                  faceResolutionScale={faceResolutionScale}
                  artwork={rasterArtwork}
                  showThumbNotch={showThumbNotch}
                  thumbNotchSize={thumbNotchSize}
                  opacity={opacityForFace(face)}
                />
                <FaceSvg
                  face={face}
                  {...faceSizes[face]}
                  pixelScale={scale}
                  artwork={artwork}
                  faceModes={faceModes}
                  faceText={faceText}
                  showThumbNotch={showThumbNotch}
                  thumbNotchSize={thumbNotchSize}
                  useWrapArtwork={useWrapArtwork}
                  wrapArtwork={wrapArtwork}
                  wrapRect={wrapRect}
                  wrapViewX={wrapOffsets[face]}
                  opacity={opacityForFace(face)}
                  rawId={`${rawId}-${large ? "large" : "small"}`}
                  rasterizedArtwork={Boolean(rasterArtwork)}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="assembled-mini-frame">
        {renderStage()}
        {!isDragging && <span className="assembled-mini-tooltip">Click to enlarge</span>}
      </div>
      {false && (
      <div className="assembled-obsolete-ui" hidden>
      <div className="assembled-heading">
        <div>
          <h2 id={`${rawId}-title`}>Assembled box</h2>
          <p>Drag to rotate · Use arrow keys when focused</p>
        </div>
        <div className="assembled-actions">
          {(
            <button type="button" className="preview-icon-button" onClick={() => setExpanded(true)}>
              Larger view
            </button>
          )}
          <button
            type="button"
            className="preview-icon-button"
            aria-expanded={true}
            onClick={() => undefined}
          >
            Hide
          </button>
        </div>
      </div>
      {(
        <>
          {renderStage()}
          <div className="assembled-footer">
            <button type="button" className="reset-view-button" onClick={() => setRotation(DEFAULT_ROTATION)}>
              Reset view
            </button>
          </div>
        </>
      )}
      </div>
      )}
      {expanded && (
        <div className="assembled-modal" role="dialog" aria-modal="true" aria-labelledby={`${rawId}-modal-title`}>
          <button className="assembled-modal-backdrop" type="button" aria-label="Close larger view" onClick={() => setExpanded(false)} />
          <div className="assembled-modal-panel">
            <div className="assembled-modal-heading">
              <div>
                <h2 id={`${rawId}-modal-title`}>Assembled box</h2>
                <p>Drag to rotate · Use arrow keys when focused</p>
              </div>
              <div className="assembled-actions">
                <button type="button" className="preview-icon-button" onClick={() => setRotation(DEFAULT_ROTATION)}>Reset</button>
                <button type="button" className="modal-close-button" aria-label="Close larger view" onClick={() => setExpanded(false)}>×</button>
              </div>
            </div>
            {renderStage(true)}
          </div>
        </div>
      )}
    </>
  );
}
