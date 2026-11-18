import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Clock, Globe, HandCoins, MapPin } from 'lucide-react';
import { GoogleMapsIcon } from '@/components/GoogleMapsIcon';
import { SocialIcon } from '@/components/SocialIconLinks';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';
import { WeekStrip } from '@/components/WeekStrip';
import type { MarketCardData } from '@/lib/marketCard';

interface MarketCardViewProps {
  card: MarketCardData;
  /** Client callers wire this to analytics; server lists omit it. */
  onDetailClick?: () => void;
  /** Highlighted, as when the reader points at its pin on the city map. */
  active?: boolean;
  /** Extra classes for the card itself, such as a grid span. */
  className?: string;
}

/**
 * The one market card, used by the landing page and explorer, city pages,
 * state pages and the A-Z index, so every list reads as the same product.
 *
 * Scannable at a glance: the market's photo when it has one, the name, where
 * it is (and how far), the days it opens with its hours and the dates in the
 * year it runs, whether it takes SNAP/EBT, and three quiet shortcuts for the
 * listings that have them: Instagram, directions in Google Maps and the
 * market's own website. Everything else lives on the market page.
 *
 * The whole card is clickable through a stretched link on the title, which
 * keeps the market name as the anchor text a crawler follows.
 */
export function MarketCardView({ card, onDetailClick, active = false, className = '' }: MarketCardViewProps) {
  const { name, cover, kind, place, placeHref, distance, days, hours, dates, instagram, directions, website } = card;
  const hasShortcuts = Boolean(instagram || website || directions);
  const hasPlace = Boolean(place) || distance !== undefined;
  const tracking = { market_slug: card.slug, placement: 'card' };
  // Above the card's stretched link, so each shortcut is its own target.
  const shortcutClass =
    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-green-50 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-700 dark:text-zinc-400 dark:hover:bg-green-900/30 dark:hover:text-green-400';

  // No row of its own for the shortcuts: they share the SNAP/EBT row when the
  // market takes it, otherwise they close the last line the card already has,
  // so a card never carries a half-empty line.
  const linksOn: 'snap' | 'times' | 'days' | 'place' | 'own' | undefined = !hasShortcuts
    ? undefined
    : card.snap
      ? 'snap'
      : hours || dates
        ? 'times'
        : days.length > 0
          ? 'days'
          : hasPlace
            ? 'place'
            : 'own';
  const links = hasShortcuts && (
    <span className="-my-1.5 -mr-1.5 ml-auto flex shrink-0 items-center">
      {instagram && (
        <TrackedExternalLink
          href={instagram}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label={`${name} on Instagram`}
          title="Instagram"
          className={shortcutClass}
          eventName="Market Social Profile Opened"
          eventProperties={{ ...tracking, platform: 'instagram' }}
        >
          <SocialIcon platform="instagram" className="h-4 w-4" />
        </TrackedExternalLink>
      )}
      {directions && (
        <TrackedExternalLink
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions to ${name} in Google Maps`}
          title="Directions"
          className={shortcutClass}
          eventName="Market Directions Opened"
          eventProperties={{ ...tracking, destination: 'google-maps' }}
        >
          <GoogleMapsIcon disc={false} className="h-[18px] w-[18px]" />
        </TrackedExternalLink>
      )}
      {website && (
        <TrackedExternalLink
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} website`}
          title="Website"
          className={shortcutClass}
          eventName="Official Market Website Opened"
          eventProperties={tracking}
        >
          <Globe aria-hidden className="h-4 w-4" />
        </TrackedExternalLink>
      )}
    </span>
  );
  const icon = 'h-3.5 w-3.5 shrink-0 text-green-700 dark:text-green-500';

  return (
    // A container, so the card lays itself out by its own width: photo on top
    // when narrow, photo beside the text when the list gives it room (a photo
    // card spans two grid columns, which keeps it as tall as its neighbours).
    <article
      className={`@container group relative isolate h-full overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-zinc-900 ${
        active
          ? 'border-green-600 dark:border-green-500'
          : 'border-zinc-200 hover:border-green-600/40 dark:border-zinc-800 dark:hover:border-green-500/40'
      } ${className}`}
    >
      <div className="flex h-full flex-col @xl:min-h-40 @xl:flex-row">
        {cover && (
          // Decorative here: the title link names the market.
          <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-zinc-100 @xl:aspect-auto @xl:w-2/5 dark:bg-zinc-800">
            <Image
              src={cover.url}
              alt=""
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover object-[50%_30%] transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          {kind && (
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{kind}</p>
          )}

          <h3 className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
            <Link
              href={card.href}
              onClick={onDetailClick}
              className="line-clamp-2 transition-colors after:absolute after:inset-0 after:z-0 after:content-[''] group-hover:text-green-700 focus-visible:outline-none dark:group-hover:text-green-400"
            >
              {name}
            </Link>
          </h3>

          {hasPlace && (
            <div className="flex min-h-5 items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
              <MapPin aria-hidden className={icon} />
              {place &&
                (placeHref ? (
                  <Link href={placeHref} className="relative z-10 truncate underline-offset-2 hover:underline">
                    {place}
                  </Link>
                ) : (
                  <span className="truncate">{place}</span>
                ))}
              {distance !== undefined && (
                <span className="shrink-0 text-zinc-500 dark:text-zinc-500">
                  {place ? '· ' : ''}
                  {distance} mi
                </span>
              )}
              {linksOn === 'place' && links}
            </div>
          )}

          {days.length > 0 && (
            <div className="flex min-h-5 items-center">
              <WeekStrip days={days} />
              {linksOn === 'days' && links}
            </div>
          )}

          {(hours || dates) && (
            <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-700 dark:text-zinc-300">
              {hours && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock aria-hidden className={icon} />
                  {hours}
                </span>
              )}
              {dates && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden className={icon} />
                  {dates}
                </span>
              )}
              {linksOn === 'times' && links}
            </div>
          )}

          {(card.snap || linksOn === 'own') && (
            <div className="mt-auto flex min-h-5 items-center gap-2 pt-1">
              {card.snap && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                  <HandCoins aria-hidden className="h-3.5 w-3.5" />
                  SNAP/EBT
                </span>
              )}
              {links}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
