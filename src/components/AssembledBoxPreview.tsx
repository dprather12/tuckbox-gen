import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
  masterOpacity: number;
  faceOpacities: FaceOpacityMap;
}

const DEFAULT_ROTATION = { x: -18, y: 30 };
const MIN_TILT = -55;
const MAX_TILT = 35;

export function clampPreviewTilt(value: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, value));
}

function FaceSvg({
  face,
  width,
  height,
  artwork,
  faceModes,
  faceText,
  showThumbNotch,
  useWrapArtwork,
  wrapArtwork,
  wrapRect,
  wrapViewX,
  opacity,
  rawId
}: {
  face: FaceName;
  width: number;
  height: number;
  artwork: ArtworkMap;
  faceModes: FaceModeMap;
  faceText: TextMap;
  showThumbNotch: boolean;
  useWrapArtwork: boolean;
  wrapArtwork?: ArtworkSettings;
  wrapRect: Rect;
  wrapViewX: number;
  opacity: number;
  rawId: string;
}) {
  const localRect = { x: 0, y: 0, width, height };
  const clipId = `${rawId}-${face}-clip`;
  const wrapClipId = `${rawId}-${face}-wrap-clip`;
  const patternId = `${rawId}-${face}-wrap-pattern`;
  const isBody = face === "front" || face === "back" || face === "left" || face === "right";
  const usesWrap = isBody && useWrapArtwork && Boolean(wrapArtwork);
  const notchRadius = Math.min(7, Math.max(3.5, width * 0.09));
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

  return (
    <svg
      className="assembled-face-art"
      viewBox={`0 0 ${width} ${height}`}
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
        <rect width={width} height={height} fill="#fff" />
        <g transform={orientationTransform}>
          {usesWrap && wrapArtwork?.fit === "repeat" && (
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill={`url(#${patternId})`}
              opacity={opacity}
            />
          )}
          {usesWrap && wrapArtwork?.fit !== "repeat" && (
            <g transform={`translate(${-wrapViewX} 0)`}>
              <ArtworkImage
                rect={wrapRect}
                artwork={wrapArtwork}
                clipId={wrapClipId}
                opacity={opacity}
              />
            </g>
          )}
          {!usesWrap && (faceModes[face] ?? "image") === "image" && (
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
  useWrapArtwork,
  wrapArtwork,
  masterOpacity,
  faceOpacities
}: Props) {
  const rawId = useId().replace(/:/g, "");
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number } | undefined>(undefined);
  const dragged = useRef(false);
  const { width, depth, height } = dimensions;
  const perimeter = 2 * width + 2 * depth;
  const wrapRect = { x: 0, y: 0, width: perimeter, height };
  const wrapOffsets: Record<FaceName, number> = {
    back: 0,
    left: width,
    front: width + depth,
    right: 2 * width + depth,
    top: 0,
    bottom: 0
  };
  const faceSizes: Record<FaceName, { width: number; height: number }> = {
    front: { width, height },
    back: { width, height },
    left: { width: depth, height },
    right: { width: depth, height },
    top: { width, height: depth },
    bottom: { width, height: depth }
  };
  const opacityForFace = (face: FaceName) =>
    (masterOpacity / 100) * ((faceOpacities[face] ?? 100) / 100);
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
    const scale = Math.min(
      (large ? 520 : 76) / width,
      (large ? 390 : 52) / depth,
      (large ? 540 : 72) / height
    );
    const style = {
      "--box-width": `${width * scale}px`,
      "--box-depth": `${depth * scale}px`,
      "--box-height": `${height * scale}px`,
      transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`
    } as CSSProperties;

    return (
      <div
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
          {(Object.keys(faceSizes) as FaceName[]).map((face) => (
            <div className={`assembled-face assembled-face-${face}`} key={face} data-face={face}>
              <FaceSvg
                face={face}
                {...faceSizes[face]}
                artwork={artwork}
                faceModes={faceModes}
                faceText={faceText}
                showThumbNotch={showThumbNotch}
                useWrapArtwork={useWrapArtwork}
                wrapArtwork={wrapArtwork}
                wrapRect={wrapRect}
                wrapViewX={wrapOffsets[face]}
                opacity={opacityForFace(face)}
                rawId={`${rawId}-${large ? "large" : "small"}`}
              />
            </div>
          ))}
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
