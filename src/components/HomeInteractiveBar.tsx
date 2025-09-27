"use client";
import BookingBar from "@/components/SearchBar";
import { getVillaContent } from '@/data/villaData';

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
  const villaContent = getVillaContent(locale as 'en' | 'el');
  
  return (
    <div className="-mt-6 mb-10">
      <BookingBar 
        locale={locale} 
        labels={labels}
        propertyName={villaContent.shortName}
        subline={subline}
        showPropertyHeader={false}
      />
    </div>
  );
}
