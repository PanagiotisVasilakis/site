import { LeafletMarkerData } from '@/components/LeafletMap';

// NOTE: Coordinates are approximate (WGS84). Order: [lng, lat].
// Sources: Public mapping/open data (OpenStreetMap / widely published tourist info). Minor rounding applied.
export const KALAMATA_POINTS: LeafletMarkerData[] = [
  {
    id: 'kalamata-castle',
    name: 'Kalamata Castle',
    description: '13th c. hilltop fortress with panoramic city & sea views.',
    coordinates: [22.1088, 37.0449],
    type: 'attraction'
  },
  {
    id: 'holy-apostles-church',
    name: 'Church of the Holy Apostles',
    description: 'Agioi Apostoloi – landmark Byzantine church (1821 revolution site).',
    coordinates: [22.1145, 37.0386],
    type: 'attraction'
  },
  {
    id: 'ypapanti-cathedral',
    name: 'Metropolitan Church of Ypapanti',
    description: 'Major 19th c. cathedral dedicated to the Presentation of the Lord.',
    coordinates: [22.11253, 37.04174],
    type: 'attraction'
  },
  {
    id: 'archaeological-museum',
    name: 'Archaeological Museum (Benakeion)',
    description: 'Artifacts from Messenia spanning prehistoric to Byzantine eras.',
    coordinates: [22.1127, 37.0415],
    type: 'attraction'
  },
  {
    id: 'railway-park',
    name: 'Municipal Railway Park',
    description: 'Open-air rail museum & green space with historic rolling stock.',
    coordinates: [22.1163, 37.0328],
    type: 'attraction'
  },
  {
    id: 'central-square',
    name: 'Central Square (Vasileos Georgiou)',
    description: 'Main plaza – cafés, events & local gathering point.',
    coordinates: [22.1128, 37.0399],
    type: 'service'
  },
  {
    id: 'marina',
    name: 'Kalamata Marina',
    description: 'Harbor & yachting area along Navarinou.',
    coordinates: [22.1227, 37.0226],
    type: 'service'
  },
  {
    id: 'beach-central',
    name: 'Kalamata Beach',
    description: 'Pebble beachfront (central section of Navarinou).',
    coordinates: [22.1239, 37.0277],
    type: 'attraction'
  },
  {
    id: 'military-museum',
    name: 'Military Museum of Kalamata',
    description: 'Exhibits on modern Greek military history.',
    coordinates: [22.1097, 37.0465],
    type: 'attraction'
  },
  {
    id: 'open-air-market',
    name: 'Open Air Market (Laiki Agora)',
    description: 'Saturday produce & local goods market area.',
    coordinates: [22.1180, 37.0462],
    type: 'service'
  },
  {
    id: 'dance-megaron',
    name: 'Dance Megaron / Cultural Center',
    description: 'Venue linked with Kalamata International Dance Festival.',
    coordinates: [22.1193, 37.0391],
    type: 'attraction'
  },
  {
    id: 'lighthouse',
    name: 'Harbor Lighthouse',
    description: 'Small lighthouse at pier – seaside walk endpoint.',
    coordinates: [22.1255, 37.0189],
    type: 'attraction'
  },
  {
    id: 'general-hospital',
    name: 'General Hospital of Kalamata',
    description: 'Regional medical facility.',
    coordinates: [22.1025, 37.0506],
    type: 'service'
  },
  // --- Added: Pharmacies (approximate coordinates) ---
  {
    id: 'pharmacy-plateia-1',
    name: 'Pharmacy (Central Square)',
    description: 'Local pharmacy near central square.',
    coordinates: [22.1135, 37.0403],
    type: 'service'
  },
  {
    id: 'pharmacy-plateia-2',
    name: 'Pharmacy (Ypapanti Side)',
    description: 'Pharmacy a short walk from the cathedral.',
    coordinates: [22.1119, 37.0401],
    type: 'service'
  },
  // --- Added: Bank ATMs (nearest, one per major bank) ---
  {
    id: 'atm-alpha',
    name: 'Alpha Bank ATM',
    description: 'Nearest Alpha Bank ATM to central square.',
    coordinates: [22.1122, 37.0404],
    type: 'service'
  },
  {
    id: 'atm-ethniki',
    name: 'National Bank (NBG) ATM',
    description: 'National Bank of Greece ATM.',
    coordinates: [22.1115, 37.0402],
    type: 'service'
  },
  {
    id: 'atm-piraeus',
    name: 'Piraeus Bank ATM',
    description: 'Nearest Piraeus Bank ATM.',
    coordinates: [22.1143, 37.0395],
    type: 'service'
  },
  {
    id: 'atm-eurobank',
    name: 'Eurobank ATM',
    description: 'Nearest Eurobank ATM.',
    coordinates: [22.1152, 37.0392],
    type: 'service'
  },
  // --- Added: Notable restaurants (popular picks) ---
  {
    id: 'restaurant-kardamo',
    name: 'Kardamo',
    description: 'Modern Greek cuisine – highly rated local favorite.',
    coordinates: [22.1136, 37.0388],
    type: 'restaurant'
  },
  {
    id: 'restaurant-ta-rolla',
    name: 'Ta Rolla',
    description: 'Traditional meze & homestyle dishes.',
    coordinates: [22.1129, 37.0392],
    type: 'restaurant'
  },
  {
    id: 'restaurant-bistroteca',
    name: 'Bistroteca',
    description: 'Casual bistro & bar near square.',
    coordinates: [22.1123, 37.0400],
    type: 'restaurant'
  },
  {
    id: 'restaurant-thiasos',
    name: 'Thiasos',
    description: 'Seafood & local plates (popular venue).',
    coordinates: [22.1180, 37.0350],
    type: 'restaurant'
  },
  {
    id: 'restaurant-limeni',
    name: 'Limeni',
    description: 'Seafront dining along Navarinou.',
    coordinates: [22.1225, 37.0250],
    type: 'restaurant'
  }
];

export default KALAMATA_POINTS;
