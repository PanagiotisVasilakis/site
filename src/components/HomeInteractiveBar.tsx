"use client";
import BookingBar from "@/components/SearchBar";
import { getVillaContent } from '@/data/villaData';

interface BookingLabels { dates: string; addDates: string; guestsLabel: string; guestSingular: string; guestPlural: string; checkAvailability: string; }
interface Props {
  locale: string;
  labels?: BookingLabels;
}

export default function HomeInteractiveBar({ locale, labels }: Props) {
  const villaContent = getVillaContent(locale as 'en' | 'el');
  
  return (
    <div className="-mt-6 mb-10">
      <BookingBar 
        locale={locale} 
        labels={labels}
        propertyName={villaContent.shortName}
      />
    </div>
  );
}
