"use client";

import { useMemo } from 'react';
import { useGuestSession } from '@/hooks/useGuestSession';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { useFavorites } from '@/lib/favorites';
import { StayTile } from './StayTile';

/**
 * identity §9.4 tiles 1–4: the portal tile (only with the portal flag on), then Wi-Fi and check-out, locked
 * until sign-in, and the house rules. Wi-Fi, check-out and the rules link into the check-in page, so they
 * render only while check-in is enabled (which needs the portal). For the same reason a signed-in guest gets
 * no portal tile while check-in is off: its only target is the check-in page.
 */
export function StaySessionTiles({ locale, portalEnabled, checkinEnabled }: { locale: Locale; portalEnabled: boolean; checkinEnabled: boolean }) {
  const { isSignedIn } = useGuestSession();
  const t = getDictionary(locale).stay.hub;
  const checkIn = `/${locale}/check-in`;
  const unlocked = isSignedIn ? 'default' : 'locked';
  return (
    <>
      {portalEnabled ? (
        isSignedIn ? (
          checkinEnabled ? (
            <StayTile variant="portal" icon="key" title={t.portalOpenTitle} text={t.portalOpenText} href={checkIn} cta={t.portalOpenCta} />
          ) : null
        ) : (
          <StayTile variant="portal" icon="user" title={t.portalSignInTitle} text={t.portalSignInText} href={`/${locale}/guest`} cta={t.portalSignInCta} />
        )
      ) : null}
      {checkinEnabled ? (
        <>
          <StayTile variant={unlocked} icon="wifi" title={t.wifiTitle} text={t.wifiText} href={`${checkIn}#wifi`} lockedLabel={t.locked} />
          <StayTile variant={unlocked} icon="clock" title={t.checkoutTitle} text={t.checkoutText} href={`${checkIn}#check-out`} lockedLabel={t.locked} />
          <StayTile icon="rules" title={t.rulesTitle} text={t.rulesText} href={`${checkIn}#house-rules`} />
        </>
      ) : null}
    </>
  );
}

/**
 * identity §9.4 tile 7: favourites with the saved count (localStorage, so client-side). `favoriteIds` are the
 * ids of every current place, so ids left in the store by removed content are not counted (like SavedLink
 * and the favourites page).
 */
export function FavouritesTile({ locale, favoriteIds }: { locale: Locale; favoriteIds: readonly string[] }) {
  const { favorites } = useFavorites();
  const count = useMemo(() => favoriteIds.filter((id) => favorites.has(id)).length, [favoriteIds, favorites]);
  const t = getDictionary(locale).stay.hub;
  return (
    <StayTile
      icon="heart"
      title={t.favouritesTitle}
      text={t.favouritesText}
      href={`/${locale}/favorites`}
      badge={<span className="stay-tile__count">{count}</span>}
    />
  );
}
