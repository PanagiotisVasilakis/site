"use client";
import { useEffect } from "react";
import BookingBar from "@/components/SearchBar";
import { getApartmentContent } from '@/data/apartmentData';

interface BookingLabels {
  dates: string;
  addDates: string;
  guestsLabel: string;
  guestSingular: string;
  guestPlural: string;
  checkAvailability: string;
  arrivalLabel?: string;
  arrivalPlaceholder?: string;
  departureLabel?: string;
  departurePlaceholder?: string;
}
interface Props {
  locale: string;
  labels?: BookingLabels;
  subline?: string; // localized subtitle passed from server page for SSR consistency
}

export default function HomeInteractiveBar({ locale, labels, subline }: Props) {
  const apartmentContent = getApartmentContent(locale as 'en' | 'el');
  useEffect(() => {
    const scrollIfNeeded = () => {
      if (typeof window === 'undefined') return;
      if (window.location.hash !== '#book-now') return;
      const el = document.getElementById('home-booking-bar');
      if (el) {
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    };

    scrollIfNeeded();
    window.addEventListener('hashchange', scrollIfNeeded);
    return () => window.removeEventListener('hashchange', scrollIfNeeded);
  }, []);
  
  return (
    <div
      id="home-booking-bar"
      className="-mt-6 mb-10 rounded-3xl shadow-[0_22px_48px_-26px_rgba(8,20,40,0.38)]"
    >
      <BookingBar 
        locale={locale} 
        labels={labels}
  propertyName={apartmentContent.shortName}
        subline={subline}
        showPropertyHeader={false}
      />
    </div>
  );
}
