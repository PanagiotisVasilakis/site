import { getOrderedCategories, pickCategoryLocale } from "@/lib/data";
import { absUrl, siteUrl } from "@/lib/site";
import { getDictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import HomeHero from "@/components/HomeHero";
import DeferredHomeInteractiveBar from "@/components/DeferredHomeInteractiveBar";
import DeferredContactSection from "@/components/DeferredContactSection";
import HomeFeatureGrid, { type HomeFeature } from "@/components/home/HomeFeatureGrid";
import { headers } from 'next/headers';
import { serializeJsonLd } from '@/lib/jsonLd';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const cats = getOrderedCategories();
  const featureCards: HomeFeature[] = [
    {
      href: `/${eff}/apartment`,
      label: t.house.navLabel,
    },
    {
      href: `/${eff}/check-in`,
      label: t.checkin.navInfoLabel,
    },
    ...cats.slice(0, 2).map((c) => ({
      href: `/${eff}/${c.slug}`,
      label: t.categories[c.slug as "phones" | "moments"] ?? (pickCategoryLocale(c, "title", eff) ?? c.title),
    })),
  ];

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: t.appTitle,
            url: siteUrl,
            logo: absUrl('/favicon.ico')
          })
        }}
      />
      <div className="cancel-top-gap">
        <HomeHero
          title={t.homeTitle}
          subtitle={t.homeSubtitle}
        />
      </div>
      <div className="page-container home-typography mx-auto max-w-5xl">
        <DeferredHomeInteractiveBar
          locale={eff}
          subline={t.homeSubline}
        />
        <HomeFeatureGrid
          label={t.homeFeaturesLabel}
          features={featureCards}
        />
      </div>
      <DeferredContactSection locale={eff} />
    </>
  );
}
