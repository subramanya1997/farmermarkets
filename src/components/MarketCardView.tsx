import Link from 'next/link';
import { CalendarDays, Clock, Globe, MapPin } from 'lucide-react';
import type { FarmerMarket } from '@/lib/api';
import { getMarketProducts } from '@/lib/api';
import { formatMarketDays, formatMarketSeason, getSocialLinks, type SocialLink } from '@/lib/marketDisplay';
import { SocialIconLinks } from '@/components/SocialIconLinks';
import { displayName } from '@/lib/seo';

interface MarketCardViewProps {
  market: FarmerMarket;
  /** Client callers wire these to analytics; the server index card omits them. */
  onDetailClick?: () => void;
  onWebsiteClick?: (websiteHost: string | undefined) => void;
  onSocialClick?: (link: SocialLink) => void;
}

/**
 * The one market card design, shared by the interactive explorer grid and the
 * server-rendered A-Z index so the two views read as the same product.
 *
 * The whole card is clickable through a stretched link on the title, which
 * keeps the market name as the anchor text a crawler follows. External links
 * in the footer sit above the overlay (`z-10`) so they stay independently
 * clickable.
 */
export function MarketCardView({ market, onDetailClick, onWebsiteClick, onSocialClick }: MarketCardViewProps) {
  const name = displayName(market.name);
  const days = formatMarketDays(market.days);
  const season = formatMarketSeason(market.season);
  const products = getMarketProducts(market).slice(0, 3);
  const extraProducts = Math.max(0, getMarketProducts(market).length - 3);
  const socialLinks = getSocialLinks(market);
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');

  const website = market.websites?.[0];
  const websiteHost = (() => {
    try {
      return website ? new URL(website).hostname : undefined;
    } catch {
      return undefined;
    }
  })();

  const locationParts = [
    market.city,
    market.state,
    market.country_code === 'US' ? undefined : market.country,
  ].filter((part, index, parts): part is string =>
    Boolean(part) &&
    parts.findIndex((candidate) => candidate?.toLowerCase() === part?.toLowerCase()) === index
  );

  const assistancePrograms = [
    market.snap && 'SNAP',
    market.wic && 'WIC',
    market.fmnp && 'FMNP',
  ].filter((program): program is string => Boolean(program)).slice(0, 2);

  const hasFooter = assistancePrograms.length > 0 || socialLinks.length > 0 || Boolean(website);

  return (
    <article className="group relative isolate flex h-full flex-col rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-green-600/40 hover:shadow-lg hover:shadow-green-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-500/40">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 rounded-t-xl bg-gradient-to-r from-green-600 via-emerald-500 to-lime-500 transition-transform duration-300 group-hover:scale-x-100"
      />

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-green-700 dark:text-green-500">
            {marketType ?? 'Local market'}
          </p>
          {market.distance !== undefined && market.distance !== Infinity && (
            <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              {market.distance} mi
            </span>
          )}
        </div>

        <h3 className="text-[15px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          <Link
            href={`/markets/${market.slug}`}
            onClick={onDetailClick}
            className="line-clamp-2 transition-colors after:absolute after:inset-0 after:z-0 after:content-[''] group-hover:text-green-700 focus-visible:outline-none dark:group-hover:text-green-400"
          >
            {name}
          </Link>
        </h3>

        <div className="space-y-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
          {locationParts.length > 0 && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-green-600/70 dark:text-green-500/70" />
              <span className="truncate">{locationParts.join(', ')}</span>
            </p>
          )}
          {days && (
            <p className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-green-600/70 dark:text-green-500/70" />
              <span className="truncate">{days}</span>
            </p>
          )}
          {season && (
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0 text-green-600/70 dark:text-green-500/70" />
              <span className="truncate">{season}</span>
            </p>
          )}
        </div>

        {products.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1">
            {products.map((product) => (
              <span
                key={product}
                className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {product}
              </span>
            ))}
            {extraProducts > 0 && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                +{extraProducts} more
              </span>
            )}
          </div>
        )}
      </div>

      {hasFooter && (
        <div className="flex min-h-11 items-center justify-between gap-2 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
          <div className="flex items-center gap-1">
            {assistancePrograms.map((program) => (
              <span
                key={program}
                className="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                {program}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <SocialIconLinks links={socialLinks} marketName={name} onLinkClick={onSocialClick} />
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} website`}
                title="Official website"
                onClick={onWebsiteClick ? () => onWebsiteClick(websiteHost) : undefined}
                className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-green-50 hover:text-green-700 dark:text-zinc-500 dark:hover:bg-green-900/30 dark:hover:text-green-400"
              >
                <Globe className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
