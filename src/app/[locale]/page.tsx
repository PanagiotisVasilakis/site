import type { Metadata } from 'next';
import { getDictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import HeroLivingPhoto from "@/components/home/hero/HeroLivingPhoto";
import FactStrip from "@/components/home/FactStrip";
import KineticBand from "@/components/home/KineticBand";
import Highlights from "@/components/home/Highlights";
import BalconyWindow from "@/components/home/BalconyWindow";
import RoomsSection from "@/components/home/RoomsSection";
import NightsTeaser from "@/components/home/NightsTeaser";
import LocationSection from "@/components/home/LocationSection";
import HostLetter from "@/components/home/HostLetter";
import FaqSection from "@/components/home/FaqSection";
import ContactBand from "@/components/home/ContactBand";
import HomeRevealObserver from "@/components/home/HomeRevealObserver";
import { homeFromPriceCents, nightsTeaserFrom } from '@/components/home/homeNights';
import AvailabilityBookBar from '@/components/shell/AvailabilityBookBar';
import { headers } from 'next/headers';
import { serializeJsonLd } from '@/lib/jsonLd';
import { localizedAlternates, localizedOpenGraph, organizationJsonLd } from '@/lib/seo';
import { PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { propertyToday } from '@/lib/availability/calendarDate';
import { logger } from '@/lib/logger-enterprise';
import { readPublicAvailability, type PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

/** The availability data for the hero price, the 14-night teaser and the BookBar (identity §1.4), or null. */
async function homeAvailability(now: Date): Promise<PublicAvailability | null> {
  try {
    return await readPublicAvailability(now);
  } catch {
    // No details: the error may carry connection data. The page then shows no price and no teaser.
    logger.error('Home price could not be read');
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  // No title: the root layout's default is the brand. The description is the primary tagline (identity §1.2).
  return {
    description: getDictionary(eff).home.heroTagline,
    alternates: localizedAlternates(eff),
    openGraph: localizedOpenGraph(eff, ''),
  };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const eff = normalizeLocale(locale);
  const now = new Date();
  const availability = await homeAvailability(now);
  const fromPriceCents = availability ? homeFromPriceCents(availability) : null;
  const teaser = availability ? nightsTeaserFrom(availability) : null;

  return (
    <>
      <script
        nonce={nonce}
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd())
        }}
      />
      {/* identity §9.1 items 1-12 (no ReviewsStrip: no owner review data, §1.4) */}
      <HeroLivingPhoto locale={eff} fromPriceCents={fromPriceCents} />
      <FactStrip locale={eff} />
      <KineticBand />
      <Highlights locale={eff} now={now} />
      <BalconyWindow locale={eff} />
      <RoomsSection locale={eff} />
      {teaser ? <NightsTeaser data={teaser} locale={eff} now={now} /> : null}
      <LocationSection locale={eff} />
      <HostLetter locale={eff} />
      <FaqSection locale={eff} today={availability?.today ?? propertyToday(PROPERTY_TIME_ZONE, now)} />
      <ContactBand locale={eff} />
      <HomeRevealObserver />
      <AvailabilityBookBar availability={availability} locale={eff} />
    </>
  );
}
