"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { DateRange, dateRangeFromParams, dateRangeToParams, getNights } from "@/lib/dateUtils";
import { format } from "date-fns";
import dynamic from "next/dynamic";
import { trackEvent } from "@/lib/analyticsClient";
import { getApartmentContent } from "@/data/apartmentData";

interface BookingState {
  dateRange: DateRange;
  adults: number;
  kids: number;
}

type DateField = "arrival" | "departure";

interface PickerAnchor {
  left: number;
  width: number;
  containerWidth: number;
}

interface Props {
  onBooking?: (state: BookingState) => void;
  initial?: Partial<Omit<BookingState, "dateRange"> & { dates?: string }>;
  locale?: string;
  propertyName?: string;
  labels?: {
    dates: string;
    addDates: string;
    guestsLabel: string;
    adultsLabel?: string;
    kidsLabel?: string;
    guestSingular: string;
    guestPlural: string;
    checkAvailability: string;
    arrivalLabel?: string;
    arrivalPlaceholder?: string;
    departureLabel?: string;
    departurePlaceholder?: string;
  };
  subline?: string;
  showPropertyHeader?: boolean;
}

const LazyDateRangePicker = dynamic(() => import("@/components/DateRangePicker"), {
  ssr: false,
  loading: () => (
    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-40 w-[min(92vw,360px)] max-h-[min(80vh,450px)]">
      <div className="animate-pulse space-y-3">
        <div className="h-6 bg-gray-100 rounded w-1/3" />
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 14 }).map((_, idx) => (
            <div key={idx} className="h-10 bg-gray-100 rounded" />
          ))}
        </div>
      </div>
    </div>
  ),
});

export default function BookingBar({
  onBooking,
  initial,
  locale = "en",
  propertyName,
  labels,
  subline,
  showPropertyHeader = true,
}: Props) {
  const apartmentContent = getApartmentContent(locale as "en" | "el");
  const router = useRouter();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const arrivalButtonRef = useRef<HTMLButtonElement | null>(null);
  const departureButtonRef = useRef<HTMLButtonElement | null>(null);

  const [isHydrated, setIsHydrated] = useState(false);
  const [state, setState] = useState<BookingState>(() => ({
    dateRange: { from: undefined, to: undefined },
    adults: initial?.adults || 1,
    kids: initial?.kids || 0,
  }));
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [shouldLoadDatePicker, setShouldLoadDatePicker] = useState(false);
  const [activeDateField, setActiveDateField] = useState<DateField | null>(null);
  const [pickerAnchor, setPickerAnchor] = useState<PickerAnchor | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    const urlParams = new URLSearchParams(window.location.search);
    const fromParams = dateRangeFromParams(urlParams);
    if (fromParams.from || fromParams.to) {
      setState((s) => ({ ...s, dateRange: fromParams }));
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    const params = new URLSearchParams(window.location.search);
    const dateParams = dateRangeToParams(state.dateRange);
    params.delete("checkin");
    params.delete("checkout");
    dateParams.forEach((value, key) => params.set(key, value));

    if (state.adults > 1) params.set("adults", state.adults.toString());
    else params.delete("adults");

    if (state.kids > 0) params.set("kids", state.kids.toString());
    else params.delete("kids");

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [state, isHydrated]);

  const updateState = useCallback(<K extends keyof BookingState>(key: K, value: BookingState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const computeAnchor = useCallback(
    (field: DateField | null) => {
      if (!field) return;
      const container = containerRef.current;
      if (!container) return;
      const targetButton = field === "arrival" ? arrivalButtonRef.current : departureButtonRef.current;
      if (!targetButton) return;

      const containerRect = container.getBoundingClientRect();
      const buttonRect = targetButton.getBoundingClientRect();
      setPickerAnchor({
        left: buttonRect.left - containerRect.left,
        width: buttonRect.width,
        containerWidth: containerRect.width,
      });
    },
    []
  );

  const handleDatePickerOpen = useCallback(
    (field: DateField) => {
      setShouldLoadDatePicker(true);
      setActiveDateField(field);
      setIsDatePickerOpen(true);
      computeAnchor(field);
      if (typeof window !== "undefined") {
        requestAnimationFrame(() => computeAnchor(field));
      }
    },
    [computeAnchor]
  );

  const handleDatePickerClose = useCallback(() => {
    setIsDatePickerOpen(false);
    setActiveDateField(null);
    setPickerAnchor(null);
  }, []);

  const handleDateChange = useCallback(
    (dateRange: DateRange) => {
      updateState("dateRange", dateRange);
      const nextField: DateField | null = dateRange.from && !dateRange.to
        ? "departure"
        : dateRange.from && dateRange.to
          ? null
          : activeDateField;
      setActiveDateField(nextField);
      if (nextField) {
        if (typeof window !== "undefined") {
          requestAnimationFrame(() => computeAnchor(nextField));
        } else {
          computeAnchor(nextField);
        }
      } else {
        setPickerAnchor(null);
      }
    },
    [updateState, activeDateField, computeAnchor]
  );

  useEffect(() => {
    if (!isDatePickerOpen) return;
    const updatePosition = () => computeAnchor(activeDateField);
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isDatePickerOpen, activeDateField, computeAnchor]);

  const checkAvailability = useCallback(() => {
    if (onBooking) {
      onBooking(state);
      return;
    }

    const params = new URLSearchParams();

    if (state.dateRange?.from) {
      params.set("checkin", format(state.dateRange.from, "yyyy-MM-dd"));
    }

    if (state.dateRange?.to) {
      params.set("checkout", format(state.dateRange.to, "yyyy-MM-dd"));
    }

    if (state.adults > 1) {
      params.set("adults", state.adults.toString());
    }

    if (state.kids > 0) {
      params.set("kids", state.kids.toString());
    }

    trackEvent("booking_check_availability", {
      property: propertyName,
      hasDates: !!(state.dateRange?.from && state.dateRange?.to),
      adults: state.adults,
      kids: state.kids,
      totalGuests: state.adults + state.kids,
      nights: getNights(state.dateRange),
    });

    const bookingUrl = `/${locale}/book?${params.toString()}`;
    router.push(bookingUrl);
  }, [onBooking, state, locale, propertyName, router]);

  const arrivalLabel = labels?.arrivalLabel || "Arrival";
  const departureLabel = labels?.departureLabel || "Departure";
  const arrivalPlaceholder = labels?.arrivalPlaceholder || labels?.addDates || "Add dates";
  const departurePlaceholder = labels?.departurePlaceholder || labels?.addDates || "Add dates";

  const arrivalDisplay = state.dateRange?.from ? format(state.dateRange.from, "MMM d, yyyy") : arrivalPlaceholder;
  const departureDisplay = state.dateRange?.to ? format(state.dateRange.to, "MMM d, yyyy") : departurePlaceholder;

  const nights = getNights(state.dateRange);
  const hasValidDates = state.dateRange?.from && state.dateRange?.to;
  const basePrice = apartmentContent.pricing.basePrice;
  const totalPrice = hasValidDates ? nights * basePrice : 0;

  return (
    <div className="relative" ref={containerRef}>
      <div className="mb-4 text-center">
        {showPropertyHeader && (
          <h2 className="text-lg font-serif italic font-bold text-brand-800">{propertyName || apartmentContent.shortName}</h2>
        )}
        <p className="text-sm font-serif italic font-bold text-muted mt-3">
          {subline ?? `${apartmentContent.location.city}, ${apartmentContent.location.country} • €${basePrice}/night`}
        </p>
      </div>

      <div className="booking-bar" role="search" aria-label="Check availability">
        <div className="search-seg text-left flex-1">
          <button
            ref={arrivalButtonRef}
            type="button"
            className={`search-trigger flex h-full w-full flex-col text-left gap-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${activeDateField === "arrival" ? "is-active" : ""
              }`}
            onClick={() => handleDatePickerOpen("arrival")}
            aria-expanded={isDatePickerOpen && activeDateField === "arrival"}
            aria-haspopup="dialog"
          >
            <span className="search-label">{arrivalLabel}</span>
            <span className="search-value">{arrivalDisplay}</span>
          </button>
        </div>

        <div className="search-seg text-left flex-1">
          <button
            ref={departureButtonRef}
            type="button"
            className={`search-trigger flex h-full w-full flex-col text-left gap-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${activeDateField === "departure" ? "is-active" : ""
              }`}
            onClick={() => handleDatePickerOpen("departure")}
            aria-expanded={isDatePickerOpen && activeDateField === "departure"}
            aria-haspopup="dialog"
          >
            <span className="search-label">{departureLabel}</span>
            <span className="search-value">{departureDisplay}</span>
          </button>
        </div>

        <div className="search-seg text-left min-w-[100px]">
          <span className="search-label">{labels?.adultsLabel || "Adults"}</span>
          <span className="search-value flex items-center gap-1">
            <input
              aria-label={labels?.adultsLabel || "Adults"}
              type="number"
              min={1}
              max={apartmentContent.specs.maxGuests - state.kids}
              value={state.adults}
              onChange={(e) =>
                updateState(
                  "adults",
                  Math.max(1, Math.min(apartmentContent.specs.maxGuests - state.kids, Number(e.target.value) || 1))
                )
              }
              className="guest-input bg-transparent w-10 focus:outline-none"
            />
            <span className="opacity-70">
              {state.adults === 1 ? "adult" : "adults"}
            </span>
          </span>
        </div>

        <div className="search-seg text-left min-w-[100px]">
          <span className="search-label">{labels?.kidsLabel || "Kids"}</span>
          <span className="search-value flex items-center gap-1">
            <input
              aria-label={labels?.kidsLabel || "Kids"}
              type="number"
              min={0}
              max={apartmentContent.specs.maxGuests - state.adults}
              value={state.kids}
              onChange={(e) =>
                updateState(
                  "kids",
                  Math.max(0, Math.min(apartmentContent.specs.maxGuests - state.adults, Number(e.target.value) || 0))
                )
              }
              className="guest-input bg-transparent w-10 focus:outline-none"
            />
            <span className="opacity-70">
              {state.kids === 1 ? "kid" : "kids"}
            </span>
          </span>
        </div>

        <div className="search-action">
          <button
            type="button"
            onClick={checkAvailability}
            className={`booking-button ${isHydrated && hasValidDates ? "ready" : ""}`}
            aria-label={labels?.checkAvailability || "Check availability"}
            disabled={!isHydrated || !hasValidDates}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-sm font-medium">{labels?.checkAvailability || "Check availability"}</span>
              {isHydrated && hasValidDates && (
                <span className="text-xs opacity-90">
                  €{totalPrice} • {nights} {nights === 1 ? "night" : "nights"}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {shouldLoadDatePicker && (
        <LazyDateRangePicker
          isOpen={isDatePickerOpen}
          value={state.dateRange}
          onChange={handleDateChange}
          onClose={handleDatePickerClose}
          showPricing={true}
          activeField={activeDateField}
          anchor={pickerAnchor ?? undefined}
        />
      )}
    </div>
  );
}
