import Link from 'next/link';
import { favoriteIdOf } from '@/components/guide/guideEntries';
import { Icon } from '@/components/icons/Icon';
import { categories } from '@/data/categories';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory, pickLocale } from '@/lib/data';
import { FavouritesTile, StaySessionTiles } from './StaySessionTiles';
import { StayTile } from './StayTile';

/** The 112 entry is the SOS row; the next two emergency numbers follow it (§9.4 tile 5, R3-L10). */
const EMERGENCY_ID = 'emergency-112';

/** Decorative half sun behind the H1 (§9.4): rays at .5 opacity. */
function HalfSun() {
  const rays = Array.from({ length: 9 }, (_, index) => (index * 180) / 8);
  return (
    <svg className="stay-hub__sun" viewBox="0 0 240 130" aria-hidden="true" focusable="false">
      <g className="stay-hub__rays">
        {rays.map((angle) => {
          const radians = (angle * Math.PI) / 180;
          const [x1, y1] = [120 + Math.cos(radians) * 74, 120 - Math.sin(radians) * 74];
          const [x2, y2] = [120 + Math.cos(radians) * 112, 120 - Math.sin(radians) * 112];
          return <line key={angle} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} />;
        })}
      </g>
      <path className="stay-hub__disc" d="M58 120a62 62 0 0 1 124 0Z" />
    </svg>
  );
}

/**
 * identity §9.4 "Your stay" hub (S shell, calm mode): no booking CTA, no BookBar, no WebGL, no scroll
 * effects. Tiles: portal (flag), Wi-Fi and check-out (locked until sign-in), house rules, important phones
 * (SOS 112 + the next two numbers), the Kalamata guide with a search that submits to the guide list
 * (`?q=`), favourites with the saved count.
 */
export function StayHub({ locale, portalEnabled, checkinEnabled }: { locale: Locale; portalEnabled: boolean; checkinEnabled: boolean }) {
  const t = getDictionary(locale);
  const hub = t.stay.hub;
  const phones = getItemsByCategory('phones')
    .filter((item) => item.tags?.includes('emergency') && item.id !== EMERGENCY_ID && item.phone)
    .slice(0, 2);
  // The favourites count covers only ids that still resolve to a place, like the guide's Saved count.
  const knownFavoriteIds = categories.flatMap((c) => getItemsByCategory(c.id).map((item) => favoriteIdOf(c, item)));

  return (
    <div className="stay-page stay-hub">
      <header className="stay-hub__head">
        <HalfSun />
        <h1 className="stay-hub__title">{hub.title}</h1>
        <p className="stay-hub__lead">{hub.lead}</p>
      </header>

      <div className="stay-tiles">
        <StaySessionTiles locale={locale} portalEnabled={portalEnabled} checkinEnabled={checkinEnabled} />

        <StayTile icon="phone" title={t.guide.phonesTitle} className="stay-tile--phones">
          <ul className="stay-phones">
            <li>
              <a href="tel:112" className="stay-phones__row stay-phones__row--sos shell-link">
                <span className="stay-phones__sos">112</span>
                <span className="stay-phones__name">{hub.sosLabel}</span>
              </a>
            </li>
            {phones.map((item) => {
              const href = telHref(item.phone);
              return href ? (
                <li key={item.id}>
                  <a href={href} className="stay-phones__row shell-link">
                    <span className="stay-phones__name">{pickLocale(item, 'name', locale) ?? item.name}</span>
                    <span className="stay-phones__number">{item.phone}</span>
                  </a>
                </li>
              ) : null;
            })}
          </ul>
          <Link href={`/${locale}/phones`} className="ui-btn ui-btn--link-arrow stay-tile__more">
            {hub.phonesAll}
            <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
          </Link>
        </StayTile>

        <StayTile icon="compass" title={t.shell.navGuide} text={hub.guideText} href={`/${locale}/moments`} className="stay-tile--guide">
          <form action={`/${locale}/moments`} method="get" role="search" className="stay-search">
            <label htmlFor="stay-guide-search" className="stay-search__label">{t.guide.searchLabel}</label>
            <span className="stay-search__row">
              <input id="stay-guide-search" name="q" type="search" maxLength={100} className="ui-field__input stay-search__input" />
              <button type="submit" className="ui-btn ui-btn--secondary ui-btn--md stay-search__submit">
                <Icon name="search" size={18} />
                {hub.searchSubmit}
              </button>
            </span>
          </form>
        </StayTile>

        <FavouritesTile locale={locale} favoriteIds={knownFavoriteIds} />
      </div>
    </div>
  );
}
