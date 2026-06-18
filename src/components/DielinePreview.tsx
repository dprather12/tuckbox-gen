import { forwardRef, useId } from "react";
import { BLEED_MM, SAFE_MARGIN_MM } from "../geometry";
import type {
  ArtworkMap,
  ArtworkSettings,
  DielineGeometry,
  FaceName,
  Paper,
  Rect
} from "../types";

interface Props {
  paper: Paper;
  geometry: DielineGeometry;
  artwork: ArtworkMap;
  showBleed: boolean;
}

function ArtworkImage({
  rect,
  artwork,
  clipId
}: {
  rect: Rect;
  artwork?: ArtworkSettings;
  clipId: string;
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
    />
  );
}

function DustFlap({
  x,
  y,
  width,
  height,
  top
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  top: boolean;
}) {
  const inset = Math.min(width * 0.2, 3);
  const points = top
    ? `${x},${y + height} ${x + inset},${y} ${x + width - inset},${y} ${x + width},${y + height}`
    : `${x},${y} ${x + width},${y} ${x + width - inset},${y + height} ${x + inset},${y + height}`;
  return <polygon points={points} className="cut-shape" />;
}

export const DielinePreview = forwardRef<SVGSVGElement, Props>(
  ({ paper, geometry, artwork, showBleed }, ref) => {
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
          <style>{`
            .cut-shape,.cut-line{fill:none;stroke:#17231d;stroke-width:.35}
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
          {faces.map(([face, rect]) => (
            <ArtworkImage
              key={face}
              rect={rect}
              artwork={artwork[face]}
              clipId={`${rawId}-${face}`}
            />
          ))}
        </g>

        <g id="flaps">
          <path
            d={`M ${top.x} ${top.y} L ${top.x + top.width} ${top.y} L ${top.x + top.width} ${top.y - g.tuckLip * 0.35} Q ${top.x + top.width / 2} ${top.y - g.tuckLip} ${top.x} ${top.y - g.tuckLip * 0.35} Z`}
            className="cut-shape"
          />
          <path
            d={`M ${bottom.x} ${bottom.y + bottom.height} L ${bottom.x + bottom.width} ${bottom.y + bottom.height} L ${bottom.x + bottom.width} ${bottom.y + bottom.height + g.tuckLip * 0.35} Q ${bottom.x + bottom.width / 2} ${bottom.y + bottom.height + g.tuckLip} ${bottom.x} ${bottom.y + bottom.height + g.tuckLip * 0.35} Z`}
            className="cut-shape"
          />
          <DustFlap x={panels.left.x} y={py + g.tuckLip} width={panels.left.width} height={panels.left.width} top />
          <DustFlap x={panels.right.x} y={py + g.tuckLip} width={panels.right.width} height={panels.right.width} top />
          <DustFlap x={panels.left.x} y={bodyBottom} width={panels.left.width} height={panels.left.width} top={false} />
          <DustFlap x={panels.right.x} y={bodyBottom} width={panels.right.width} height={panels.right.width} top={false} />
          <polygon
            points={`${glueX},${py + g.bodyY} ${glueX + g.glueTab},${py + g.bodyY + 4} ${glueX + g.glueTab},${bodyBottom - 4} ${glueX},${bodyBottom}`}
            className="cut-shape"
          />
        </g>

        <g id="cut-lines">
          <line x1={px} y1={py + g.bodyY} x2={px} y2={bodyBottom} className="cut-line" />
          <line x1={top.x} y1={top.y} x2={top.x} y2={py + g.bodyY} className="cut-line" />
          <line x1={top.x + top.width} y1={top.y} x2={top.x + top.width} y2={py + g.bodyY} className="cut-line" />
          <line x1={bottom.x} y1={bottom.y} x2={bottom.x} y2={bottom.y + bottom.height} className="cut-line" />
          <line x1={bottom.x + bottom.width} y1={bottom.y} x2={bottom.x + bottom.width} y2={bottom.y + bottom.height} className="cut-line" />
          <line x1={panels.front.x} y1={py + g.bodyY} x2={panels.front.x + panels.front.width} y2={py + g.bodyY} className="cut-line" />
          <line x1={panels.front.x} y1={bodyBottom} x2={panels.front.x + panels.front.width} y2={bodyBottom} className="cut-line" />
        </g>

        <g id="fold-lines">
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
          <line x1={bottom.x} y1={bottom.y + bottom.height} x2={bottom.x + bottom.width} y2={bottom.y + bottom.height} className="fold-line" />
        </g>

        {showBleed && (
          <g id="bleed-guides" data-preview-guide="bleed">
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
        )}

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
