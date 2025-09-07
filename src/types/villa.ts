// Shared villa (property) related types
export interface VillaPhoto { src: string; }
export interface VillaPhotoWithAlt extends VillaPhoto { altKey: 'bedroom' | 'kitchen' | 'living'; }
