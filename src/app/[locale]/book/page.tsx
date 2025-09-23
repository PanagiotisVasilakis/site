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
import { getVillaContent } from '@/data/villaData';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { MAP_DEFAULTS } from '@/lib/mapConstants';

// Dynamic import for map component - only loads when needed
const VillaLocationMap = dynamic(() => import('@/components/VillaLocationMap'), {
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

  // Get real villa data
  const villaContent = getVillaContent(eff);
  const property = {
    name: villaContent.name,
    location: `${villaContent.location.city}, ${villaContent.location.country}`,
    maxGuests: villaContent.specs.maxGuests,
    bedrooms: villaContent.specs.bedrooms,
    bathrooms: villaContent.specs.bathrooms,
    floor: villaContent.specs.floor,
    size: villaContent.specs.size,
    basePrice: villaContent.pricing.basePrice,
    cleaningFee: villaContent.pricing.cleaningFee,
    serviceFee: villaContent.pricing.serviceFee,
    image: '/house/att.FcEjVIjFuWRZjLgXbVE8uocMCMkIQ23IOfjVpyylEGM.jpeg'
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
    // Allow global gradient background like home page (no local override)
    <div className="min-h-screen transition-colors">
  <div className="page-container mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link 
              href={`/${eff}`} 
              className="inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 font-medium mb-4 transition-colors"
            >
              ← Back to property
            </Link>
            <h1 className="text-3xl font-bold text-[color:var(--fg-default)]">{t.booking?.completeTitle}</h1>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-3">
      <div className="rounded-2xl shadow-sm border border-[color:var(--border-soft)] p-6 space-y-6 transition-colors bg-[color:var(--layer-surface)]">
              <div>
  <h2 className="text-xl font-semibold mb-4 text-[color:var(--fg-default)]">{t.booking?.yourDetails}</h2>
                
                {/* Booking Summary */}
                <div className="rounded-lg p-4 space-y-3 transition-colors bg-[color:var(--layer-bg-subtle)]">
                  <div className="flex justify-between">
                    <span className="font-medium text-[color:var(--fg-default)]">{t.booking?.datesLabel}</span>
                    <span className="text-[color:var(--fg-muted)]">{hasValidDates ? formatDateRange(dateRange) : t.booking?.notSelected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-[color:var(--fg-default)]">{t.booking?.guestsLabel}</span>
                    <span className="text-[color:var(--fg-muted)]">{guests} {guests === 1 ? 'guest' : 'guests'}</span>
                  </div>
                  {hasValidDates && (
                    <div className="flex justify-between">
                      <span className="font-medium text-[color:var(--fg-default)]">{t.booking?.durationLabel}</span>
                      <span className="text-[color:var(--fg-muted)]">{nights} {nights === 1 ? 'night' : 'nights'}</span>
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
                      className="text-sm text-red-600 hover:text-red-700 font-medium mt-2 inline-block"
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
                <div className="text-center py-8 text-[color:var(--fg-muted)]">
                  <p>{t.booking?.selectDatesPrompt}</p>
                </div>
              )}
            </div>
          </div>

          {/* Booking Summary */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl shadow-sm border border-[color:var(--border-soft)] p-6 sticky top-6 transition-colors bg-[color:var(--layer-surface)]">
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
                  <h3 className="font-semibold text-[color:var(--fg-default)] truncate">{property.name}</h3>
                  <p className="text-sm text-[color:var(--fg-muted)] truncate">{property.location}</p>
                  <div className="text-xs text-[color:var(--fg-muted)] mt-1">
                    {property.bedrooms} bed • {property.bathrooms} bath • {ordinal(property.floor)} floor • {property.size} • {property.maxGuests} guests max
                  </div>
                </div>
              </div>

              {/* Pricing Breakdown */}
              {hasValidDates ? (
                <div className="space-y-3">
                  <h4 className="font-semibold text-[color:var(--fg-default)]">{t.booking?.priceBreakdown}</h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-[color:var(--fg-muted)]">
                      <span>{currency}{property.basePrice} × {nights} {nights === 1 ? t.search?.guestSingular : t.search?.guestPlural}</span>
                      <span>{currency}{subtotal}</span>
                    </div>
                    <div className="flex justify-between text-[color:var(--fg-muted)]">
                      <span>{t.booking?.cleaningFee}</span>
                      <span>{currency}{property.cleaningFee}</span>
                    </div>
                    <div className="flex justify-between text-[color:var(--fg-muted)]">
                      <span>{t.booking?.serviceFee}</span>
                      <span>{currency}{property.serviceFee}</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-[color:var(--border-soft)] pt-3">
                    <div className="flex justify-between font-semibold text-lg text-[color:var(--fg-default)]">
                      <span>{t.booking?.total}</span>
                      <span>{currency}{total}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[color:var(--fg-muted)]">
                  <p>{t.booking?.completeDetailsHint}</p>
                </div>
              )}

              {/* Location */}
              <div className="mt-6 pt-6 border-t border-[color:var(--border-soft)]">
                <h4 className="font-semibold mb-3 text-[color:var(--fg-default)]">{t.locationPanel?.title}</h4>
                <ClientBoundary>
                  <VillaLocationMap 
                    locale={eff}
                    height="260px"
                    zoom={15}
                    showNearbyAttractions={false}
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
                <h4 className="font-semibold mb-3 text-[color:var(--fg-default)]">{t.booking?.whatsIncluded}</h4>
                <AmenitiesList 
                  amenities={villaContent.amenities}
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
