// Shared apartment (property) related types
interface ApartmentPhoto { src: string; }
export interface ApartmentPhotoWithAlt extends ApartmentPhoto { altKey: 'bedroom' | 'bedroom_2' | 'kitchen' | 'living' | 'balcony' | 'bathroom'; }
