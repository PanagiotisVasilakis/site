// Map component constants for consistency across the app

export const MAP_DEFAULTS = {
  // Standard map heights for different contexts
  HEIGHT: {
    DEFAULT: '400px',
    COMPACT: '260px', 
    LARGE: '500px',
    BOOKING: '260px',
    VILLA_PAGE: '500px'
  },
  
  // Standard zoom levels
  ZOOM: {
    DEFAULT: 13,
    CLOSE: 15,
    OVERVIEW: 12
  }
} as const;

export const MAP_LOADING_STATES = {
  DEFAULT: 'Loading map...',
  INTERACTIVE: 'Loading interactive map...',
  LOCATION: 'Loading location...'
} as const;

export const MAP_CSS_CLASSES = {
  LOADING_CONTAINER: 'bg-gray-100 rounded-lg flex items-center justify-center',
  LOADING_TEXT: 'text-gray-500 text-sm',
  MAP_CONTAINER: 'rounded-xl overflow-hidden shadow-lg'
} as const;