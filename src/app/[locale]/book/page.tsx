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
  guests?: string;
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

  // Parse booking parameters
  const guests = parseInt(booking.guests || '2', 10);

  // Parse date range from URL
  const urlParams = new URLSearchParams();
  if (booking.checkin) urlParams.set('checkin', booking.checkin);
  if (booking.checkout) urlParams.set('checkout', booking.checkout);
  const dateRange = dateRangeFromParams(urlParams);

  // Validate booking parameters
  const hasValidDates = dateRange.from && dateRange.to;
  const dateValidation = hasValidDates ? validateDateRange(dateRange) : { valid: false, error: 'Please select dates' };
  const nights = hasValidDates ? getNights(dateRange) : 0;

  // Get real apartment data
  const apartmentContent = getApartmentContent(eff);
  const property = {
    name: apartmentContent.name,
    location: `${apartmentContent.location.city}, ${apartmentContent.location.country}`,
    maxGuests: apartmentContent.specs.maxGuests,
    bedrooms: apartmentContent.specs.bedrooms,
    bathrooms: apartmentContent.specs.bathrooms,
    floor: apartmentContent.specs.floor,
    size: apartmentContent.specs.size,
    basePrice: apartmentContent.pricing.basePrice,
    cleaningFee: apartmentContent.pricing.cleaningFee,
    serviceFee: apartmentContent.pricing.serviceFee,
    image: '/house/living/living_1.jpeg'
  };

  // Calculate pricing
  const subtotal = hasValidDates ? nights * property.basePrice : 0;
  const total = subtotal + property.cleaningFee + property.serviceFee;
  const currency = '€';
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  // Check if booking is valid
  const canBook = dateValidation.valid && guests <= property.maxGuests && guests >= 1;

  return (
    <div className="min-h-screen">
      <div className="page-container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href={`/${eff}`}
              className="inline-flex min-h-11 items-center gap-2 text-sm text-brand-700 hover:text-brand-800 font-medium mb-4 transition-colors"
            >
              ← Back to property
            </Link>
            <h1 className="text-3xl font-serif italic font-bold">{t.booking?.completeTitle}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <div className="rounded-2xl shadow-sm border border-[color:var(--border-soft)] p-6 space-y-6 transition-colors bg-[color:var(--layer-surface)]">
              <div>
                <h2 className="text-xl font-serif italic font-bold mb-4">{t.booking?.yourDetails}</h2>

                {/* Booking Summary */}
                <div className="rounded-lg p-4 space-y-3 transition-colors bg-[color:var(--layer-bg-subtle)]">
                  <div className="flex justify-between">
                    <span className="font-medium">{t.booking?.datesLabel}</span>
                    <span className="opacity-80">{hasValidDates ? formatDateRange(dateRange) : t.booking?.notSelected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">{t.booking?.guestsLabel}</span>
                    <span className="opacity-80">{guests} {guests === 1 ? 'guest' : 'guests'}</span>
                  </div>
                  {hasValidDates && (
                    <div className="flex justify-between">
                      <span className="font-medium">{t.booking?.durationLabel}</span>
                      <span className="opacity-80">{nights} {nights === 1 ? 'night' : 'nights'}</span>
                    </div>
                  )}
                </div>

                {/* Validation Errors */}
                {!dateValidation.valid && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-red-600" aria-hidden>⚠️</span>
                      <span className="text-sm text-red-800">{dateValidation.error}</span>
                    </div>
                    <Link
                      href={`/${eff}`}
                      className="inline-flex min-h-11 items-center text-sm text-red-600 hover:text-red-700 font-medium mt-2"
                    >
                      ← Go back to select dates
                    </Link>
                  </div>
                )}

                {guests > property.maxGuests && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-600" aria-hidden>⚠️</span>
                      <span className="text-sm text-yellow-800">
                        This property accommodates up to {property.maxGuests} guests. Please adjust your guest count.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Booking Form */}
              {canBook ? (
                <Suspense fallback={<BookingFormSkeleton />}>
                  <BookingForm
                    dateRange={dateRange}
                    guests={guests}
                    total={total}
                    locale={eff}
                  />
                </Suspense>
              ) : (
                <div className="text-center py-8 opacity-70">
                  <p>{t.booking?.selectDatesPrompt}</p>
                </div>
              )}
            </div>
          </div>

          {/* Booking Summary */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <div className="rounded-2xl shadow-sm border border-[color:var(--border-soft)] p-4 md:p-6 lg:sticky lg:top-6 transition-colors bg-[color:var(--layer-surface)]">
              {/* Property Card */}
              <div className="flex gap-4 mb-6">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={property.image}
                    alt={property.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                    priority={false}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif italic font-bold truncate">{property.name}</h3>
                  <p className="text-sm opacity-80 truncate">{property.location}</p>
                  <div className="text-xs opacity-70 mt-1">
                    {property.bedrooms} bed • {property.bathrooms} bath • {ordinal(property.floor)} floor • {property.size} • {property.maxGuests} guests max
                  </div>
                </div>
              </div>

              {/* Pricing Breakdown */}
              {hasValidDates ? (
                <div className="space-y-3">
                  <h4 className="font-serif italic font-bold">{t.booking?.priceBreakdown}</h4>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between opacity-80">
                      <span>{currency}{property.basePrice} × {nights} {nights === 1 ? t.search?.guestSingular : t.search?.guestPlural}</span>
                      <span>{currency}{subtotal}</span>
                    </div>
                    <div className="flex justify-between opacity-80">
                      <span>{t.booking?.cleaningFee}</span>
                      <span>{currency}{property.cleaningFee}</span>
                    </div>
                    <div className="flex justify-between opacity-80">
                      <span>{t.booking?.serviceFee}</span>
                      <span>{currency}{property.serviceFee}</span>
                    </div>
                  </div>

                  <div className="border-t border-[color:var(--border-soft)] pt-3">
                    <div className="flex justify-between font-semibold text-lg">
                      <span>{t.booking?.total}</span>
                      <span>{currency}{total}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 opacity-70">
                  <p>{t.booking?.completeDetailsHint}</p>
                </div>
              )}

              {/* Location */}
              <div className="mt-6 pt-6 border-t border-[color:var(--border-soft)]">
                <h4 className="font-serif italic font-bold mb-3">{t.locationPanel?.title}</h4>
                <ClientBoundary>
                  <ApartmentLocationMap
                    locale={eff}
                    height="260px"
                    zoom={15}
                    showNearbyAttractions={false}
                    activation="intent"
                    className="rounded-lg overflow-hidden mb-4"
                    nearbyRestaurants={[]}
                    nearbyServices={[]}
                    nearbyAttractions={[]}
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

              {/* Property Highlights with Expandable Amenities */}
              <div className="mt-6 pt-6 border-t border-[color:var(--border-soft)]">
                <h4 className="font-serif italic font-bold mb-3">{t.booking?.whatsIncluded}</h4>
                <AmenitiesList
                  amenities={apartmentContent.amenities}
                  maxInitialItems={6}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
