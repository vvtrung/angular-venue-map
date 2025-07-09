import { SizeShape, VenueMapTheme } from './venue-map.type';

const DEFAULT_SIZE_SHAPE: SizeShape = {
  width: 0,
  height: 0,
  padding: 0,
  stroke: 0,
  offsetLeft: 0,
  offsetTop: 0,
  cornerRadius: 0,
};

export const DEFAULT_MAP_CONFIG = {
  circle: {
    ...DEFAULT_SIZE_SHAPE,
    width: 50,
    height: 50,
    stroke: 2,
    padding: 10,
  },
  fontSize: 20,
  bubble: {
    ...DEFAULT_SIZE_SHAPE,
    width: 30,
    height: 20,
  },
  corner: {
    ...DEFAULT_SIZE_SHAPE,
    width: 20,
  },
  arrow: {
    ...DEFAULT_SIZE_SHAPE,
    width: 15,
    height: 10,
    padding: 12,
  },
  offsetHeight: 106,
  minimap: {
    scale: 0.12,
    opacity: 0.5,
  },
  zoom: {
    min: 1,
    max: 2.5,
    step: 0.2,
    showMiniMapAtLevel: 1.2,
  }
};

// Default theme colors that match the use cases
export const DEFAULT_VENUE_MAP_THEME: VenueMapTheme = {
  // Canvas and background colors
  canvasBackgroundColor: '#ffffff',

  // Grade visualization colors
  gradeStrokeColor: '#ffffff',
  gradeTextColor: '#ffffff',

  // Price visualization colors
  priceBackgroundColor: '#ffffff',
  priceTextColor: '#000000',
  priceBubbleStrokeColor: '#ffffff',

  // Interactive elements
  miniMapViewportColor: '#EE2039',

  // Seat colors
  availableSeatColor: '#ffffff',
  unavailableSeatColor: '#969696',
  selectedSeatColor: '#0071EAB2',
  selectedSeatBorderColor: '#0071EA',
  availableSeatBorderColor: '#0071EA',
  disabledSeatColor: '#2F2F2F',

  // Special seat types
  premiumSeatColor: '#B60000',
  premiumSeatHoverColor: '#B60000B2',
  goldSeatColor: '#8F7400',

  // UI colors
  shadowColor: 'rgba(0,0,0,0.22)',
  darkTextColor: '#767676',
};

export const MULTIPLIER_GRADE_ICON = 1.5;
