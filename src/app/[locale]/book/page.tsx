import React, { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { locales, type Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { dateRangeFromParams, formatDateRange, validateDateRange, getNights } from '@/lib/dateUtils';
// Removed unused Skeleton import
import { BookingFormSkeleton } from '@/components/LoadingSkeleton';
import BookingForm from '@/components/BookingForm';
import StaticLocationMap from '@/components/StaticLocationMap';
import { ClientBoundary } from '@/components/ClientBoundary';
import AmenitiesList from '@/components/AmenitiesList';
import { getApartmentContent } from '@/data/apartmentData';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { MAP_DEFAULTS } from '@/lib/mapConstants';

// Dynamic import for map component - only loads when needed
const ApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  loading: () => (
    <MapLoadingSkeleton height={MAP_DEFAULTS.HEIGHT.BOOKING} />
  )
});

interface BookingParams {
  checkin?: string;
  checkout?: string;
}

export default async function BookingPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<BookingParams>;
}) {
  const { locale } = await params;
  const booking = await searchParams;

  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);

  // Parse date range from URL
  const urlParams = new URLSearchParams();
  if (booking.checkin) urlParams.set('checkin', booking.checkin);
  if (booking.checkout) urlParams.set('checkout', booking.checkout);
  const dateRange = dateRangeFromParams(urlParams);

  // Validate booking parameters
  const hasValidDates = dateRange.from && dateRange.to;
  const dateValidation = hasValidDates ? validateDateRange(dateRange) : { valid: false, error: t.booking?.selectDatesError };
  const nights = hasValidDates ? getNights(dateRange) : 0;
  const nightsLabel = nights === 1 ? t.booking?.night : t.booking?.nights;

  // Get real apartment data
  const apartmentContent = getApartmentContent(eff);
  const property = {
    name: apartmentContent.name,
    location: `${apartmentContent.location.city}, ${apartmentContent.location.country}`,
    image: '/house/living/living_1.jpeg'
  };

  // Check if booking is valid
  const canBook = dateValidation.valid;

  // Reuse the already-translated specs (bedrooms, bathroom, floor, size)
  const specChips = (t.house?.specs ?? []).slice(0, 4);

  return (
    <div className="min-h-screen">
      <div className="page-container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/${eff}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-700 hover:text-brand-800 font-medium transition-colors"
          >
            {t.booking?.backToProperty}
          </Link>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-serif italic font-bold">{t.booking?.completeTitle}</h1>
              <p className="mt-2 text-sm opacity-70">{property.name} — {property.location}</p>
            </div>
            {hasValidDates && (
              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] px-4 py-2 text-sm shadow-sm">
                <span className="font-medium">{formatDateRange(dateRange)}</span>
                <span className="opacity-40" aria-hidden>•</span>
                <span className="opacity-80">{nights} {nightsLabel}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-stretch">
          {/* Left column: trip summary + guest form */}
          <div className="lg:col-span-3 order-2 lg:order-1 flex flex-col gap-6">
            {/* Trip summary tiles */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] p-4 shadow-sm transition-colors">
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{t.booking?.datesLabel}</div>
                <div className="mt-1.5 text-sm font-medium leading-snug">
                  {hasValidDates ? formatDateRange(dateRange) : t.booking?.notSelected}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] p-4 shadow-sm transition-colors">
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">{t.booking?.durationLabel}</div>
                <div className="mt-1.5 text-sm font-medium leading-snug">
                  {hasValidDates ? `${nights} ${nightsLabel}` : t.booking?.notSelected}
                </div>
              </div>
            </div>

            {/* Validation Errors */}
            {!dateValidation.valid && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <span className="text-red-600" aria-hidden>⚠️</span>
                  <span className="text-sm text-red-800">{dateValidation.error}</span>
                </div>
                <Link
                  href={`/${eff}`}
                  className="inline-flex min-h-11 items-center text-sm text-red-600 hover:text-red-700 font-medium mt-1"
                >
                  {t.booking?.goBackToDates}
                </Link>
              </div>
            )}

            {/* Guest details card */}
            <div className="flex-1 rounded-2xl shadow-sm border border-[color:var(--border-soft)] transition-colors bg-[color:var(--layer-surface)] overflow-hidden">
              <div className="px-6 py-5 border-b border-[color:var(--border-soft)] bg-[color:var(--layer-bg-subtle)]">
                <h2 className="text-xl font-serif italic font-bold">{t.booking?.yourDetails}</h2>
              </div>
              <div className="p-6">
                {canBook ? (
                  <Suspense fallback={<BookingFormSkeleton />}>
                    <BookingForm
                      dateRange={dateRange}
                      locale={eff}
                      labels={t.booking!.form!}
                      propertyName={property.name}
                    />
                  </Suspense>
                ) : (
                  <div className="text-center py-10 opacity-70">
                    <p>{t.booking?.selectDatesPrompt}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column: property + amenities */}
          <div className="lg:col-span-2 order-1 lg:order-2 flex flex-col gap-6">
            {/* Property card */}
            <div className="rounded-2xl shadow-sm border border-[color:var(--border-soft)] transition-colors bg-[color:var(--layer-surface)] overflow-hidden">
              <div className="relative h-44 w-full">
                <Image
                  src={property.image}
                  alt={property.name}
                  fill
                  sizes="(max-width: 1024px) 100vw, 420px"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="p-5">
                <h3 className="font-serif italic font-bold text-lg">{property.name}</h3>
                <p className="text-sm opacity-80 mt-0.5">{property.location}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {specChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[color:var(--border-soft)] bg-[color:var(--layer-bg-subtle)] px-3 py-1 text-xs font-medium opacity-90"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Amenities card */}
            <div className="flex-1 rounded-2xl shadow-sm border border-[color:var(--border-soft)] transition-colors bg-[color:var(--layer-surface)] p-5">
              <h4 className="font-serif italic font-bold mb-3">{t.booking?.whatsIncluded}</h4>
              <AmenitiesList
                amenities={apartmentContent.amenities}
                maxInitialItems={6}
                showMoreLabel={t.booking?.showAllAmenities}
                showLessLabel={t.booking?.showLessAmenities}
              />
            </div>
          </div>
        </div>

        {/* Full-width: Explore the Neighborhood */}
        <div className="mt-6 lg:mt-8 rounded-2xl shadow-sm border border-[color:var(--border-soft)] transition-colors bg-[color:var(--layer-surface)] p-5 md:p-6">
          <h4 className="font-serif italic font-bold mb-3">{t.locationPanel?.title}</h4>
          <ClientBoundary>
            <ApartmentLocationMap
              locale={eff}
              height="360px"
              zoom={15}
              activation="intent"
              className="rounded-xl overflow-hidden"
            />
          </ClientBoundary>
          <div className="mt-4">
            <StaticLocationMap
              locale={eff}
              compact={false}
              variant="panel"
              showHeading={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
