import { Icon, type IconName } from '@/components/icons/Icon';
import { Section } from '@/components/ui/Section';
import { getApartmentContent } from '@/data/apartmentData';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

/** One §6 icon per amenity group of src/data/apartmentData.ts. */
const GROUP_ICONS: Readonly<Record<string, IconName>> = {
  essentials: 'key',
  comfort: 'snowflake',
  kitchen: 'kitchen',
  bathroom: 'bath',
  outdoor: 'mountain',
  safety: 'lock',
};

/** identity §9.2 amenities: the grouped lists of the apartment data (the only source of these facts). */
export default function ApartmentAmenities({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).house.amenities;
  const groups = getApartmentContent(locale).amenityGroups;

  return (
    <Section id="amenities" eyebrow={t.eyebrow} title={t.title} className="apt-amenities">
      <div className="apt-amenities__grid">
        {groups.map((group) => (
          <div key={group.id} className="apt-amenity">
            <h3 className="apt-amenity__title">
              <span className="apt-amenity__icon"><Icon name={GROUP_ICONS[group.id] ?? 'check'} size={24} /></span>
              {group.title}
            </h3>
            <ul className="apt-amenity__list">
              {group.items.map((item) => <li key={item} className="apt-amenity__item">{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
