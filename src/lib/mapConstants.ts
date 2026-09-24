// Map component constants for consistency across the app

export const MAP_DEFAULTS = {
  // Standard map heights for different contexts
  HEIGHT: {
    DEFAULT: '400px',
    COMPACT: '260px', 
    BOOKING: '260px',
  },
} as const;

export const MAP_CSS_CLASSES = {
  LOADING_CONTAINER: 'surface-subtle rounded-lg flex items-center justify-center',
  LOADING_TEXT: 'text-subtle text-sm',
} as const;
