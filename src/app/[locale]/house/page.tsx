import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { housePhotos, type HousePhoto } from '@/data/housePhotos';
import { getItemsByCategory } from '@/lib/data';
import HouseCinematic from '@/components/HouseCinematic';
import VillaLocationMap from '@/components/VillaLocationMap';

// Photo metadata (can be swapped with real images later). Provide width/height for CLS stability.
// When replacing, generate blurDataURL via next/image loader or manual tiny base64.
// Derive alt grouping key heuristically; type any to avoid build break if generation script shape changes.
export type PhotoWithAlt = HousePhoto & { altKey: 'bedroom' | 'kitchen' | 'living' };
const photos: PhotoWithAlt[] = housePhotos.slice(0, 12).map((p: HousePhoto) => ({
  ...p,
  altKey: p.src.toLowerCase().includes('bed') ? 'bedroom' : p.src.toLowerCase().includes('kitch') ? 'kitchen' : 'living'
}));

export const dynamic = 'force-static';

export default async function HouseInfo({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const t = getDictionary(eff);
  const ht = t.house;
  
  // Fetch nearby data on server side
  const nearbyRestaurants = getItemsByCategory('restaurants').slice(0, 5);
  const nearbyServices = getItemsByCategory('phones').slice(0, 3);
  const nearbyAttractions = getItemsByCategory('sightseeing').slice(0, 4);
  
  return (
    <div>
      <HouseCinematic locale={eff} t={t} houseText={ht} photos={photos} />
      
      {/* Villa Location & Nearby */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-6 md:px-14">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-semibold text-brand-800 mb-4">Location & Nearby</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Discover your apartment’s prime location in Kalamata, just 50m from the Town Hall, 
              and explore local restaurants, attractions, and services in the area.
            </p>
          </div>
          
          <VillaLocationMap 
            locale={eff}
            height="500px"
            zoom={12}
            showNearbyAttractions={true}
            className="rounded-xl overflow-hidden shadow-lg"
            nearbyRestaurants={nearbyRestaurants}
            nearbyServices={nearbyServices}
            nearbyAttractions={nearbyAttractions}
          />
          
          {/* Distances */}
          <div className="mt-8 bg-gray-50 rounded-xl p-6">
            <h3 className="text-xl font-semibold text-brand-800 mb-4 text-center">Distances & Access</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {(t.house?.distances || []).map((distance, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-lg">
                  <span className="text-brand-600" aria-hidden>📍</span>
                  <span className="text-sm text-gray-700">{distance}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl mb-2" aria-hidden>🏛️</div>
              <h3 className="font-semibold text-gray-900 mb-1">Town Center</h3>
              <p className="text-sm text-gray-600">50m to Town Hall & services</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2" aria-hidden>🏖️</div>
              <h3 className="font-semibold text-gray-900 mb-1">Beach Access</h3>
              <p className="text-sm text-gray-600">5 min drive to coast</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2" aria-hidden>🚗</div>
              <h3 className="font-semibold text-gray-900 mb-1">Transportation</h3>
              <p className="text-sm text-gray-600">Free parking & airport 15 min</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// Cinematic layout handled by client component HouseCinematic.