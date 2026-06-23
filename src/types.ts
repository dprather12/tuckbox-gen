export type Unit = "mm" | "in";
export type PaperSize = "letter" | "a4" | "custom";
export type Orientation = "auto" | "portrait" | "landscape";
export type ResolvedOrientation = Exclude<Orientation, "auto">;
export type FaceName = "front" | "back" | "left" | "right" | "top" | "bottom";
export type ImageFit = "crop" | "stretch" | "repeat";
export type BottomClosure = "tuck" | "glued";
export type FaceContentMode = "image" | "text";
export type TextAlignment = "left" | "center" | "right";
export type TextOrientation = "horizontal" | "vertical";

export interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface DimensionCalculatorSettings {
  cardWidth: number;
  cardHeight: number;
  cardThickness: number;
  cardCount: number;
  sleeved: boolean;
  sleeveMicrons: number;
  paddingWidth: number;
  paddingDepth: number;
  paddingHeight: number;
}

export interface PaperDimensions {
  width: number;
  height: number;
}

export interface ArtworkSettings {
  src: string;
  name: string;
  fit: ImageFit;
  zoom: number;
  offsetX: number;
  offsetY: number;
  backgroundColor?: string;
  dominantColor?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export type ArtworkMap = Partial<Record<FaceName, ArtworkSettings>>;

export interface TextSettings {
  content: string;
  html: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: TextAlignment;
  orientation: TextOrientation;
  mirrorVertical: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export type TextMap = Partial<Record<FaceName, TextSettings>>;
export type FaceModeMap = Partial<Record<FaceName, FaceContentMode>>;

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
  bottomUnderFlap?: Rect;
  bottomClosure: BottomClosure;
  pageX: number;
  pageY: number;
}
