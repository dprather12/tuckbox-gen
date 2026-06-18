export type Unit = "mm" | "in";
export type PaperSize = "letter" | "a4";
export type Orientation = "auto" | "portrait" | "landscape";
export type ResolvedOrientation = Exclude<Orientation, "auto">;
export type FaceName = "front" | "back" | "left" | "right" | "top" | "bottom";
export type ImageFit = "crop" | "stretch";

export interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface ArtworkSettings {
  src: string;
  name: string;
  fit: ImageFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export type ArtworkMap = Partial<Record<FaceName, ArtworkSettings>>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Paper {
  width: number;
  height: number;
  name: string;
  orientation: ResolvedOrientation;
}

export interface DielineGeometry {
  totalWidth: number;
  totalHeight: number;
  bodyY: number;
  glueTab: number;
  flapDepth: number;
  tuckLip: number;
  panels: Record<Exclude<FaceName, "top" | "bottom">, Rect>;
  top: Rect;
  bottom: Rect;
  pageX: number;
  pageY: number;
}
