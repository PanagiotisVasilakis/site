"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { DateRange, formatDateRange, dateRangeFromParams, dateRangeToParams, getNights } from '@/lib/dateUtils';
import { format } from 'date-fns';
import DateRangePicker from '@/components/DateRangePicker';
import { trackEvent } from '@/lib/analyticsClient';
import { getVillaContent } from '@/data/villaData';

interface BookingState {
  dateRange: DateRange;
  guests: number;
}

interface Props {
  onBooking?: (state: BookingState) => void;
  initial?: Partial<Omit<BookingState, 'dateRange'> & { dates?: string }>;
  locale?: string;
  propertyName?: string;
  labels?: {
    dates: string; addDates: string; guestsLabel: string; guestSingular: string; guestPlural: string; checkAvailability: string;
  };
}

export default function BookingBar({ onBooking, initial, locale = 'en', propertyName, labels }: Props) {
  const villaContent = getVillaContent(locale as 'en' | 'el');
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  
  // Initialize date range without URL params to avoid hydration mismatch
  const [state, setState] = useState<BookingState>(() => {
    return {
      dateRange: { from: undefined, to: undefined },
      guests: initial?.guests || 1,
    };
  });
  
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const dateButtonRef = useRef<HTMLButtonElement | null>(null);

  // Initialize from URL params after hydration
  useEffect(() => {
    setIsHydrated(true);
    const urlParams = new URLSearchParams(window.location.search);
    const fromParams = dateRangeFromParams(urlParams);
    if (fromParams.from || fromParams.to) {
      setState(s => ({ ...s, dateRange: fromParams }));
    }
  }, []);

  // Update URL when state changes (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    
    const params = new URLSearchParams(window.location.search);
    
    // Update date params
    const dateParams = dateRangeToParams(state.dateRange);
    params.delete('checkin');
    params.delete('checkout');
    dateParams.forEach((value, key) => params.set(key, value));
    
    // Update guests
    if (state.guests > 1) params.set('guests', state.guests.toString());
    else params.delete('guests');
    
    const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [state, isHydrated]);

  const updateState = useCallback(<K extends keyof BookingState>(key: K, value: BookingState[K]) => {
    setState(s => ({ ...s, [key]: value }));
  }, []);

  const handleDateChange = useCallback((dateRange: DateRange) => {
    updateState('dateRange', dateRange);
  }, [updateState]);

  const handleDatePickerOpen = useCallback(() => {
    console.log('Opening date picker');
    setIsDatePickerOpen(true);
  }, []);

  const handleDatePickerClose = useCallback(() => {
    console.log('Closing date picker');
    setIsDatePickerOpen(false);
  }, []);

  const checkAvailability = useCallback(() => {
    // Custom onBooking handler takes precedence
    if (onBooking) {
      onBooking(state);
      return;
    }

    // Default behavior: navigate to booking page for this property
    const params = new URLSearchParams();
    
    if (state.dateRange?.from) {
      params.set('checkin', format(state.dateRange.from, 'yyyy-MM-dd'));
    }
    
    if (state.dateRange?.to) {
      params.set('checkout', format(state.dateRange.to, 'yyyy-MM-dd'));
    }
    
    if (state.guests > 1) {
      params.set('guests', state.guests.toString());
    }

    // Track booking attempt
    trackEvent('booking_check_availability', {
      property: propertyName,
      hasDates: !!(state.dateRange?.from && state.dateRange?.to),
      guests: state.guests,
      nights: getNights(state.dateRange)
    });

    // Navigate to booking page for this property
    const bookingUrl = `/${locale}/book?${params.toString()}`;
    router.push(bookingUrl);
  }, [onBooking, state, locale, propertyName, router]);
  const dateDisplayText = state.dateRange?.from || state.dateRange?.to 
    ? formatDateRange(state.dateRange)
    : (labels?.addDates || 'Add dates');

  const nights = getNights(state.dateRange);
  const hasValidDates = state.dateRange?.from && state.dateRange?.to;
  const basePrice = villaContent.pricing.basePrice;
  const totalPrice = hasValidDates ? nights * basePrice : 0;

  return (
    <div className="relative">
      {/* Property Info */}
      <div className="mb-4 text-center">
        <h2 className="text-lg font-semibold text-brand-800">{propertyName || villaContent.shortName}</h2>
        <p className="text-sm text-gray-600">{villaContent.location.city}, {villaContent.location.country} • €{basePrice}/night</p>
      </div>
      
      <div className="booking-bar" role="search" aria-label="Check availability">
        <button 
          ref={dateButtonRef}
          type="button" 
          className={`search-seg text-left flex-1 ${isHydrated && (state.dateRange?.from && state.dateRange?.to) ? 'ring-2 ring-brand-200' : ''}`}
          onClick={handleDatePickerOpen}
          aria-expanded={isDatePickerOpen}
          aria-haspopup="dialog"
        >
          <span className="search-label">
            {labels?.dates || 'Dates'} {isHydrated ? (isDatePickerOpen ? '🟢' : (state.dateRange?.from && state.dateRange?.to) ? '✅' : '⚪') : '⚪'}
          </span>
          <span className="search-value">{dateDisplayText}</span>
        </button>

        <div className="search-seg text-left min-w-[120px]">
          <span className="search-label">{labels?.guestsLabel || 'Guests'}</span>
          <span className="search-value flex items-center gap-1">
            <input
              aria-label={labels?.guestsLabel || 'Guests'}
              type="number"
              min={1}
              max={villaContent.specs.maxGuests}
              value={state.guests}
              onChange={e => updateState('guests', Math.max(1, Math.min(villaContent.specs.maxGuests, Number(e.target.value) || 1)))}
              className="bg-transparent w-14 focus:outline-none" 
            />
            <span className="opacity-70">
              {state.guests === 1 ? (labels?.guestSingular || 'guest') : (labels?.guestPlural || 'guests')}
            </span>
          </span>
        </div>

        <div className="search-action">
          <button 
            type="button" 
            onClick={checkAvailability} 
            className={`booking-button ${isHydrated && hasValidDates ? 'ready' : ''}`}
            aria-label={labels?.checkAvailability || 'Check availability'}
            disabled={!isHydrated || !hasValidDates}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium">
                {labels?.checkAvailability || 'Check availability'}
              </span>
              {isHydrated && hasValidDates && (
                <span className="text-xs opacity-90">
                  €{totalPrice} • {nights} {nights === 1 ? 'night' : 'nights'}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Date Picker */}
      <DateRangePicker
        isOpen={isDatePickerOpen}
        value={state.dateRange}
        onChange={handleDateChange}
        onClose={handleDatePickerClose}
        showPricing={true}
      />
    </div>
  );
}
