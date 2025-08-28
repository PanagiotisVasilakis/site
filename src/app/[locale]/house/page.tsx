import Link from 'next/link';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { housePhotos, type HousePhoto } from '@/data/housePhotos';
import HouseGalleryLightbox from '@/components/HouseGalleryLightbox';
import Image from 'next/image';

// Photo metadata (can be swapped with real images later). Provide width/height for CLS stability.
// When replacing, generate blurDataURL via next/image loader or manual tiny base64.
// Derive alt grouping key heuristically; type any to avoid build break if generation script shape changes.
type PhotoWithAlt = HousePhoto & { altKey: 'bedroom' | 'kitchen' | 'living' };
const photos: PhotoWithAlt[] = housePhotos.slice(0, 9).map((p: HousePhoto) => ({
  ...p,
  altKey: p.src.toLowerCase().includes('bed') ? 'bedroom' : p.src.toLowerCase().includes('kitch') ? 'kitchen' : 'living'
}));

export const dynamic = 'force-static';

export default async function HouseInfo({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  const t = getDictionary(eff);
  const ht = t.house;
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold" style={{color:'var(--text-accent)'}}>{ht?.title || 'Guest House Info'}</h1>
        <p className="text-sm text-gray-600 mt-2">{ht?.intro || 'Practical details, amenities and a quick photo tour.'}</p>
        <p className="mt-4 text-sm"><Link href={`/${eff}`}>{t.backHome}</Link></p>
      </header>
      <section className="grid gap-4 sm:grid-cols-3" aria-label="House photos">
        {photos.map((p, i) => {
          const alt = ht?.photoAlts?.[p.altKey as keyof NonNullable<typeof ht.photoAlts>] || p.altKey;
          return (
            <figure key={p.src} className="relative overflow-hidden rounded-md ring-1 ring-gray-200 bg-gray-50 group">
              <button
                type="button"
                data-open-photo={i}
                aria-label={`Open photo ${i+1}`}
                className="absolute inset-0 focus:outline-none"
              />
              <Image
                src={p.src}
                alt={alt}
                width={p.width}
                height={p.height}
                placeholder="blur"
                blurDataURL={p.blurDataURL}
                priority={i===0}
                sizes="(max-width:640px) 100vw, (max-width:1024px) 33vw, 256px"
                className="h-full w-full object-cover aspect-[4/3] transition-transform group-hover:scale-[1.03]"
              />
            </figure>
          );
        })}
      </section>
      <HouseGalleryLightbox photos={photos} alts={ht?.photoAlts} />
      <section className="prose prose-sm max-w-none">
        <h2>{ht?.overview || 'Overview'}</h2>
        <p>{ht?.overview ? undefined : 'The house offers comfortable accommodation with modern amenities suitable for families or small groups. All essentials are provided so you can relax immediately on arrival.'}
          {ht?.overview && ' '}{ht?.overview && ' '}{/* placeholder if translation includes details separately */}
        </p>
        <h3>{ht?.amenities || 'Amenities'}</h3>
        <ul>
          {(ht?.amenityList || []).map(a => <li key={a}>{a}</li>)}
        </ul>
        <h3>{ht?.rules || 'House Rules'}</h3>
        <ul>
          {(ht?.rulesList || []).map(r => <li key={r}>{r}</li>)}
        </ul>
        <h3>{ht?.checkin || 'Check-in / Check-out'}</h3>
        <p>{eff === 'el'
          ? 'Άφιξη μετά τις 15:00. Αναχώρηση έως τις 11:00. Διαθέσιμη αυτόνομη είσοδος με κωδικό έξυπνης κλειδαριάς πριν την άφιξη.'
          : 'Check‑in after 15:00. Check‑out by 11:00. Self check‑in is available with a smart lock code provided before arrival.'}
        </p>
        <h3>{ht?.emergency || 'Emergency & Support'}</h3>
        <p>{eff === 'el'
          ? 'Δείτε την κατηγορία Σημαντικά Τηλέφωνα για αριθμούς έκτακτης ανάγκης. Για οτιδήποτε άλλο, επικοινωνήστε με τον οικοδεσπότη μέσω της πλατφόρμας ή του παρεχόμενου τηλεφώνου.'
          : 'See the Important Phones category for emergency numbers. For anything else, contact the host via the platform or provided phone.'}
        </p>
      </section>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        // Basic LodgingBusiness schema (can be enriched with address, geo, etc.)
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'LodgingBusiness',
          name: ht?.title || 'Guest House',
          image: photos.map((p: PhotoWithAlt) => p.src),
          amenityFeature: (ht?.amenityList || []).map(a => ({ '@type': 'LocationFeatureSpecification', name: a })),
          petsAllowed: false,
        }) }}
      />
    </div>
  );
}

// Lightbox handled by client component HouseGalleryLightbox.