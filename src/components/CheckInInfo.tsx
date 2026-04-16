"use client";
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import internalFetch from '@/lib/internalFetchClient';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { MAP_DEFAULTS } from '@/lib/mapConstants';
// Local type for highlights (kept in-file to avoid an extra util dependency)
type LocationHighlight = { icon?: string; title: string; description: string };

type NearbyCategoryItem = {
  id: string;
  name: string;
  summary?: string;
  slug?: string;
  rating?: number;
  priceLevel?: number;
  location?: { lat: number; lng: number };
};

const DynamicApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton height={MAP_DEFAULTS.HEIGHT.COMPACT} />,
});

interface CheckInInfoProps {
  locale: string;
  nearbyRestaurants?: NearbyCategoryItem[];
  nearbyServices?: NearbyCategoryItem[];
  nearbyAttractions?: NearbyCategoryItem[];
}

export default function CheckInInfo({
  locale,
  nearbyRestaurants = [],
  nearbyServices = [],
  nearbyAttractions = [],
}: CheckInInfoProps) {
  const t = getDictionary((locale as Locale) ?? 'en');
  // Combine checkinInfo and locationPanel so location-related strings are available
  const checkinStrings = ({ ...(t.checkinInfo ?? {}), ...(t.locationPanel ?? {}) }) as Record<string, string | undefined>;
  // Prefer the structured dictionary `locationPanel.highlights` when present
  // (this ensures the Explore box and this panel stay in sync). If the
  // dictionary doesn't include structured highlights, fall back to the
  // existing helper which may pull from other sources (or return []).
  const panelHighlights = (t.locationPanel?.highlights ?? []) as Array<{
    icon?: string;
    title: string;
    description: string;
  }>;
  // Only use structured highlights from the dictionary. If none are
  // present, render nothing for highlights.
  const locationHighlights: LocationHighlight[] =
    panelHighlights.length > 0
      ? panelHighlights.map((h) => ({ icon: h.icon, title: h.title, description: h.description }))
      : [];
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [canEditTimes, setCanEditTimes] = useState(false);
  const [isEditingTimes, setIsEditingTimes] = useState(false);
  const [tempCheckInTime, setTempCheckInTime] = useState('15:00');
  const [tempCheckOutTime, setTempCheckOutTime] = useState('11:00');
  const [savingTimes, setSavingTimes] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await internalFetch('/api/check-in/preferences');
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setCheckInTime(data.data.checkInTime || '15:00');
            setCheckOutTime(data.data.checkOutTime || '11:00');
            setTempCheckInTime(data.data.checkInTime || '15:00');
            setTempCheckOutTime(data.data.checkOutTime || '11:00');
            setCanEditTimes(Boolean(data.data.canEdit));
          }
        }
      } catch (error) {
        console.error('Failed to load check-in preferences:', error);
        setCanEditTimes(false);
      }
    };
    loadPreferences();
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedWifi(true);
      setTimeout(() => setCopiedWifi(false), 2000);
    });
  };

  const handleEditTimes = () => {
    if (!canEditTimes) return;
    setTempCheckInTime(checkInTime);
    setTempCheckOutTime(checkOutTime);
    setIsEditingTimes(true);
  };

  const handleCancelEdit = () => {
    setIsEditingTimes(false);
    setTempCheckInTime(checkInTime);
    setTempCheckOutTime(checkOutTime);
  };

  const handleSaveTimes = async () => {
    setSavingTimes(true);
    setTimesSaved(false);
    try {
      const res = await internalFetch('/api/check-in/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkInTime: tempCheckInTime,
          checkOutTime: tempCheckOutTime,
        }),
      });

      if (res.ok) {
        setCheckInTime(tempCheckInTime);
        setCheckOutTime(tempCheckOutTime);
        setIsEditingTimes(false);
        setTimesSaved(true);
        setTimeout(() => setTimesSaved(false), 3000);
      } else {
        const error = await res.json();
        alert(`Failed to save: ${error.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert('Failed to save preferences. Please try again.');
    } finally {
      setSavingTimes(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <section className="card p-6 bg-gradient-to-br from-[color:var(--brand-primary)] to-[color:var(--brand-secondary)]">
        <h2 className="text-2xl font-serif italic font-bold mb-2" style={{ color: 'var(--text-accent)' }}>
          {t.checkinInfo?.welcome || '🎉 Welcome to Our Apartment!'}
        </h2>
        <p className="white-in-dark" style={{ color: 'var(--text-accent)' }}>
          {t.checkinInfo?.welcomeMessage || 'We\'re delighted to have you here. Below you\'ll find everything you need for a comfortable stay.'}
        </p>
      </section>

      {/* Check-in/out Times */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>🕐</span>
            <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
              {t.checkinInfo?.checkInOutTitle || 'Check-in & Check-out'}
            </h3>
          </div>
          {!isEditingTimes && canEditTimes && (
            <button
              onClick={handleEditTimes}
              className="text-sm px-3 py-1 rounded-lg bg-[color:var(--brand-primary)] text-white hover:opacity-80 transition"
              title="Edit times (host only)"
            >
              ✏️ Edit
            </button>
          )}
        </div>
        
        {timesSaved && (
          <div className="mb-4 p-3 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm">
            ✓ Check-in times saved successfully!
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex flex-col p-4 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] flex-1">
            <span className="text-sm text-[color:var(--fg-muted)] mb-1">{t.checkinInfo?.checkInTime || 'Check-in'}</span>
            {isEditingTimes ? (
              <input
                type="time"
                value={tempCheckInTime}
                onChange={(e) => setTempCheckInTime(e.target.value)}
                className="text-2xl font-bold px-2 py-1 rounded border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]"
                style={{ color: 'var(--text-accent)' }}
              />
            ) : (
              <span className="text-2xl font-bold" style={{ color: 'var(--text-accent)' }}>{checkInTime}</span>
            )}
          </div>
          <div className="flex flex-col p-4 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] flex-1">
            <span className="text-sm text-[color:var(--fg-muted)] mb-1">{t.checkinInfo?.checkOutTime || 'Check-out'}</span>
            {isEditingTimes ? (
              <input
                type="time"
                value={tempCheckOutTime}
                onChange={(e) => setTempCheckOutTime(e.target.value)}
                className="text-2xl font-bold px-2 py-1 rounded border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)]"
                style={{ color: 'var(--text-accent)' }}
              />
            ) : (
              <span className="text-2xl font-bold" style={{ color: 'var(--text-accent)' }}>{checkOutTime}</span>
            )}
          </div>
        </div>

        {isEditingTimes && (
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSaveTimes}
              disabled={savingTimes}
              className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            >
              {savingTimes ? 'Saving...' : '✓ Save Times'}
            </button>
            <button
              onClick={handleCancelEdit}
              disabled={savingTimes}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-500 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
            >
              ✗ Cancel
            </button>
          </div>
        )}
      </section>

      {/* WiFi Information */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>📶</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {t.checkinInfo?.wifiTitle || 'Internet Access'}
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)]">
            <div className="text-sm font-serif italic font-medium text-[color:var(--fg-muted)] mb-1">{t.checkinInfo?.wifiNetwork || 'Network Name'}</div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-lg grey-in-dark">ApartmentGuest_5G</span>
              <button
                onClick={() => copyToClipboard('ApartmentGuest_5G')}
                className="text-xs px-3 py-1 rounded-full bg-[color:var(--brand-primary)] text-white hover:opacity-80 transition"
              >
                {copiedWifi ? '✓ ' + (t.checkinInfo?.copied || 'Copied') : t.checkinInfo?.copy || 'Copy'}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)]">
            <div className="text-sm font-serif italic font-medium text-[color:var(--fg-muted)] mb-1">{t.checkinInfo?.wifiPassword || 'Password'}</div>
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold text-lg grey-in-dark">Welcome2024!</span>
              <button
                onClick={() => copyToClipboard('Welcome2024!')}
                className="text-xs px-3 py-1 rounded-full bg-[color:var(--brand-primary)] text-white hover:opacity-80 transition"
              >
                {t.checkinInfo?.copy || 'Copy'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* House Rules */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>📋</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {t.checkinInfo?.houseRulesTitle || 'House Rules'}
          </h3>
        </div>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="text-green-500 text-xl mt-0.5">✓</span>
            <span>{t.checkinInfo?.rule1 || 'Quiet hours: 23:00 - 08:00'}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-500 text-xl mt-0.5">✓</span>
            <span>{t.checkinInfo?.rule2 || 'No smoking inside the property'}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-500 text-xl mt-0.5">✓</span>
            <span>{t.checkinInfo?.rule3 || 'Maximum capacity: 6 guests'}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-500 text-xl mt-0.5">✓</span>
            <span>{t.checkinInfo?.rule4 || 'Please respect the neighborhood'}</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-green-500 text-xl mt-0.5">✓</span>
            <span>{t.checkinInfo?.rule5 || 'Pets allowed with prior approval'}</span>
          </li>
        </ul>
      </section>

      {/* Important Amenities */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>⭐</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {t.checkinInfo?.amenitiesTitle || 'Key Amenities'}
          </h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 amenities-grid">
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">❄️</span>
            <span className="text-sm">{t.checkinInfo?.ac || 'Air Conditioning'}</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">🔥</span>
            <span className="text-sm">{t.checkinInfo?.heating || 'Heating'}</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">🍳</span>
            <span className="text-sm">{t.checkinInfo?.kitchen || 'Full Kitchen'}</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">🧺</span>
            <span className="text-sm">{t.checkinInfo?.washer || 'Washer/Dryer'}</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">🅿️</span>
            <span className="text-sm">{t.checkinInfo?.parking || 'Free Parking'}</span>
          </div>
          <div className="flex flex-col items-center p-3 rounded-lg bg-[color:var(--layer-surface)] border border-[color:var(--border-soft)] text-center">
            <span className="text-2xl mb-2">🏊</span>
            <span className="text-sm">{t.checkinInfo?.pool || 'Swimming Pool'}</span>
          </div>
        </div>
      </section>

      {/* Local Tips */}
      <section className="card p-5 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>💡</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {t.checkinInfo?.tipsTitle || 'Local Tips'}
          </h3>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="mt-1">🏖️</span>
            <span>{t.checkinInfo?.tip1 || 'The nearest beach is just 5 minutes walk away'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1">🛒</span>
            <span>{t.checkinInfo?.tip2 || 'Supermarket "AB Vassilopoulos" is 300m away, open 8:00-21:00'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1">🍽️</span>
          <span>{t.checkinInfo?.tip3 || 'Check our Kalamata Moments recommendations in the main menu'}</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1">🚕</span>
            <span>{t.checkinInfo?.tip4 || 'Need a taxi? Call +30 2721 023456 or use the Taxi app'}</span>
          </li>
        </ul>
      </section>

      <section className="card p-5 mt-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>📍</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {checkinStrings.locationTitle || 'Explore the Neighborhood'}
          </h3>
        </div>
  <p className="text-sm text-[color:var(--fg-muted)] max-w-2xl white-in-dark">
   {checkinStrings.locationDescription || 'Discover your apartment’s prime location in Kalamata and explore Kalamata Moments, services, and sights within minutes.'}
  </p>
        <div className="rounded-xl overflow-hidden border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] shadow-sm">
          <DynamicApartmentLocationMap
            locale={locale}
            height={MAP_DEFAULTS.HEIGHT.COMPACT}
            zoom={12}
            showNearbyAttractions
            className="min-h-[260px]"
            nearbyRestaurants={nearbyRestaurants}
            nearbyServices={nearbyServices}
            nearbyAttractions={nearbyAttractions}
          />
        </div>
        {locationHighlights.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 location-grid">
            {locationHighlights.map(({ icon, title, description }) => (
              <div
                key={`${title}-${description}`}
                className="rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] p-4 text-center shadow-sm"
              >
                {icon && (
                  <div className="text-2xl mb-2" aria-hidden>
                    {icon}
                  </div>
                )}
                <h4
                  className="text-sm font-serif italic font-medium white-in-dark"
                  style={{ color: 'var(--text-accent)' }}
                >
                  {title}
                </h4>
                <p className="text-xs text-[color:var(--fg-muted)] mt-1">{description}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Additional Info */}
      <section className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl" aria-hidden>ℹ️</span>
          <h3 className="text-xl font-serif italic font-bold" style={{ color: 'var(--text-accent)' }}>
            {t.checkinInfo?.additionalTitle || 'Good to Know'}
          </h3>
        </div>
          <div className="space-y-2 text-sm text-[color:var(--fg-muted)]">
          <p className="white-in-dark">🔑 <strong className="font-serif italic font-medium" style={{ color: 'var(--text-accent)' }}>{t.checkinInfo?.keysInfo || 'Keys:'}</strong> {t.checkinInfo?.keysDetail || 'Please leave keys in the lockbox when checking out'}</p>
          <p className="white-in-dark">🗑️ <strong className="font-serif italic font-medium" style={{ color: 'var(--text-accent)' }}>{t.checkinInfo?.trashInfo || 'Trash:'}</strong> {t.checkinInfo?.trashDetail || 'Recycling bins are located near the main entrance'}</p>
          <p className="white-in-dark">💧 <strong className="font-serif italic font-medium" style={{ color: 'var(--text-accent)' }}>{t.checkinInfo?.waterInfo || 'Water:'}</strong> {t.checkinInfo?.waterDetail || 'Tap water is safe to drink'}</p>
          <p className="white-in-dark">📺 <strong className="font-serif italic font-medium" style={{ color: 'var(--text-accent)' }}>{t.checkinInfo?.tvInfo || 'Entertainment:'}</strong> {t.checkinInfo?.tvDetail || 'Smart TV with Netflix and YouTube available'}</p>
        </div>
      </section>
    </div>
  );
}
