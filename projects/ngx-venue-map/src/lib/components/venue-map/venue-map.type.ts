import { fabric } from 'fabric';

// ============================================================================
// ENUMS
// ============================================================================

export enum VenueMapType {
  GRADE = 'grade',
  GRADE_PRICE = 'gradePrice',
}

// ============================================================================
// BASIC TYPES
// ============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
}

export interface ClientPositionSeat {
  clientX?: number;
  clientY?: number;
}

// ============================================================================
// SHAPE & DESIGN TYPES
// ============================================================================

export interface SizeShape {
  width: number;
  height: number;
  stroke: number;
  cornerRadius: number;
  padding: number;
  offsetLeft: number;
  offsetTop: number;
}

export interface Circle extends Point {
  textColor: string;
}

// ============================================================================
// MAP CONFIGURATION TYPES
// ============================================================================

export interface MapSetting {
  width: number;
  height: number;
  scale?: number;
}

export interface MiniMapConfiguration {
  scale: number;
  opacity: number;
}

export interface ZoomConfiguration {
  min: number;
  max: number;
  step: number;
  showMiniMapAtLevel: number;
}

export interface MapConfiguration {
  // Image paths - can be a single string or array of strings for multi-part images
  path: string | string[];

  // Dimensions
  width: number;
  height: number;
  offsetHeight: number;

  // Typography
  fontSize: number;

  // Shape configurations
  bubble: SizeShape;
  corner: SizeShape;
  arrow: SizeShape;
  circle: SizeShape;

  // Map interaction configurations
  zoom: ZoomConfiguration;
  minimap: MiniMapConfiguration;
}

// ============================================================================
// FABRIC.JS EXTENDED TYPES
// ============================================================================

export interface ExtendedObject extends fabric.Object {
  id?: string;
  subId?: string;
  subType?: string;
  shapeIndex?: number;
}

export interface ExtendedGroup extends fabric.Group {
  id?: string;
  subId?: string;
  subType?: string;
  shapeIndex?: number;
}

export interface ExtendedImage extends fabric.Image {
  id?: string;
  subId?: string;
  shapeIndex?: number;
}

export interface FabricCanvas extends fabric.Canvas {
  wrapperEl: HTMLElement;
  lowerCanvasEl: HTMLCanvasElement;
  upperCanvasEl: HTMLCanvasElement;
}

// ============================================================================
// GRADE SYSTEM TYPES
// ============================================================================

export interface GradeSetting {
  angle: number;
  // Draw grade.abbreviation on the circle
  circle: Circle;
  // Draw a polygon covering the grade area
  points: Point[];
  // Fill color of the polygon
  color: string;
}

export interface Grade {
  id: string;
  name: string;
  abbreviation: string;
  settings: GradeSetting[];
  disabled: boolean;
  price: number;
}

// ============================================================================
// THEME CONFIGURATION TYPES
// ============================================================================

export interface VenueMapTheme {
  // Canvas and background colors
  canvasBackgroundColor: string;

  // Grade visualization colors
  gradeStrokeColor: string;
  gradeTextColor: string;

  // Price visualization colors
  priceBackgroundColor: string;
  priceTextColor: string;
  priceBubbleStrokeColor: string;

  // Interactive elements
  miniMapViewportColor: string;

  // Seat colors
  availableSeatColor: string;
  unavailableSeatColor: string;
  selectedSeatColor: string;
  selectedSeatBorderColor: string;
  availableSeatBorderColor: string;
  disabledSeatColor: string;

  // Special seat types
  premiumSeatColor: string;
  premiumSeatHoverColor: string;
  goldSeatColor: string;

  // UI colors
  shadowColor: string;
  darkTextColor: string;
}

// =====s=======================================================================
