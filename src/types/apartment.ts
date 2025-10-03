// Shared apartment (property) related types
export interface ApartmentPhoto { src: string; }
export interface ApartmentPhotoWithAlt extends ApartmentPhoto { altKey: 'bedroom' | 'kitchen' | 'living' | 'balcony' | 'bathroom'; }
