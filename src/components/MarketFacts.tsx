import type { ComponentType } from 'react';
import { ArrowUpRight, AtSign, CalendarCheck, Globe, Mail, Map as MapIcon, Phone, Store } from 'lucide-react';
import type { FarmerMarket } from '@/lib/api';
import type { AnalyticsProperties } from '@/lib/analytics';
import { marketFacts, socialLinks, telHref, type MarketGlance } from '@/lib/marketFacts';
import { marketHighlights, safeHighlightUrl } from '@/lib/marketHighlights';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';
import { WeekStrip } from '@/components/WeekStrip';

interface MarketFactsProps {
  market: FarmerMarket;
  /** Passed straight through to the tracked outbound links. */
  analyticsProperties: AnalyticsProperties;
  /** Fact terms already answered higher up (the visit card or the glance). */
  omitTerms?: Set<string>;
  /** The "Plan your visit" card is on the page and carries the vendor links. */
  hasPlanCard?: boolean;
}

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return undefined;
  }
}

/**
 * Days, hours, season and size for a page without the visit card: a week
 * strip and a few short values instead of a paragraph restating the schedule.
 */
export function MarketGlanceCard({ glance }: { glance: MarketGlance }) {
  return (
    <section aria-label="When it is open" className="mb-6 rounded-2xl border border-zinc-200 p-4 sm:mb-8 sm:p-5 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {glance.days.length > 0 && <WeekStrip days={glance.days} />}
        {glance.hours && (
          <span className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{glance.hours}</span>
        )}
        {glance.season && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-900 dark:bg-green-950/40 dark:text-green-200">
            <CalendarCheck aria-hidden className="h-3.5 w-3.5" />
            {glance.season}
          </span>
        )}
        {glance.vendors && (
          <span className="inline-flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <Store aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
            {glance.vendors} vendors
          </span>
        )}
      </div>
      {glance.lines.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
          {glance.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Short list values read faster as chips; long ones stay a sentence. */
function FactValues({ values }: { values: string[] }) {
  if (values.length > 1 && values.every((value) => value.length <= 40)) {
    return (
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <li
            key={value}
            className="rounded-full bg-zinc-100 px-2.5 py-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {value}
          </li>
        ))}
      </ul>
    );
  }
  return <>{values.join(', ')}</>;
}

/**
 * The facts block: one row per question this record can answer that the page
 * has not already answered above it, then one compact contact row (site,
 * phone, socials, map, newsletter). Rows with no data are never emitted, and
 * the block disappears for a record that fills none.
 */
export function MarketFacts({ market, analyticsProperties, omitTerms, hasPlanCard }: MarketFactsProps) {
  const highlights = marketHighlights(market.first_party);
  const facts = marketFacts(market).filter((fact) =>
    !omitTerms?.has(fact.term) &&
    // Events and programs have their own sections below.
    !(fact.term === 'Events' && market.first_party?.events?.length) &&
    !(fact.term === 'Programs' && highlights.programs.length)
  );

  const phones = (market.phone_numbers ?? [])
    .map((value) => ({ text: value.trim(), href: telHref(value) }))
    .filter((phone) => phone.text);
  const websites = (market.websites ?? []).filter((url) => /^https?:\/\//i.test(url)).slice(0, 2);
  const socials = socialLinks(market.social_media);
  const firstParty = market.first_party;
  const links: { label: string; url?: string; event: string; icon: Icon }[] = [
    ...websites.map((url) => ({ label: hostOf(url) ?? url, url, event: 'Official Market Website Opened', icon: Globe })),
    ...socials.map((social) => ({ label: social.label, url: social.href, event: 'Market Social Profile Opened', icon: AtSign })),
    {
      label: 'Market map',
      url: firstParty?.access?.market_map_url?.value,
      event: 'Market Map Opened',
      icon: MapIcon,
    },
    {
      label: firstParty?.contact?.newsletter?.value.name || 'Newsletter',
      url: firstParty?.contact?.newsletter?.value.signup_url,
      event: 'Market Newsletter Opened',
      icon: Mail,
    },
    // With the visit card on the page its vendors tile carries these; a
    // roster section carries them too.
    ...(hasPlanCard || highlights.roster.length
      ? []
      : highlights.vendorLinks.map((link) => ({ label: link.label, url: link.href, event: link.eventName, icon: Store }))),
  ];
  const contactLinks = links.flatMap((link) => {
    const url = safeHighlightUrl(link.url);
    return url ? [{ ...link, url }] : [];
  });
  const seen = new Set<string>();
  // One link per label: two "Facebook" links side by side read as a glitch.
  const uniqueLinks = contactLinks.filter(
    (link) => !seen.has(link.url) && !seen.has(link.label) && Boolean(seen.add(link.url).add(link.label))
  );

  if (!facts.length && !phones.length && !uniqueLinks.length) return null;

  const linkClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-green-700 hover:underline dark:text-green-500';

  return (
    <section className="mt-6 sm:mt-8" aria-labelledby={facts.length ? 'market-facts-heading' : undefined} aria-label={facts.length ? undefined : 'Contact'}>
      {facts.length > 0 && (
        <>
          <h2 id="market-facts-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">
            Market details
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border border-zinc-200 p-4 sm:grid-cols-2 sm:p-5 dark:border-zinc-800">
            {facts.map((fact) => (
              <div key={fact.term}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {fact.term}
                </dt>
                <dd className="mt-1 text-sm sm:text-base text-zinc-800 dark:text-zinc-200">
                  <FactValues values={fact.values} />
                  {fact.note && (
                    <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">{fact.note}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {(phones.length > 0 || uniqueLinks.length > 0) && (
        <ul className={`flex flex-wrap gap-x-5 gap-y-2 ${facts.length ? 'mt-4' : ''}`}>
          {phones.map((phone) => (
            <li key={phone.text}>
              {phone.href ? (
                <TrackedExternalLink
                  href={phone.href}
                  className={linkClass}
                  eventName="Market Phone Clicked"
                  eventProperties={analyticsProperties}
                >
                  <Phone aria-hidden className="h-4 w-4" />
                  {phone.text}
                </TrackedExternalLink>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
                  <Phone aria-hidden className="h-4 w-4" />
                  {phone.text}
                </span>
              )}
            </li>
          ))}
          {uniqueLinks.map((link) => {
            const Glyph = link.icon;
            return (
              <li key={`${link.label}:${link.url}`}>
                <TrackedExternalLink
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                  eventName={link.event}
                  eventProperties={{ ...analyticsProperties, destination_host: hostOf(link.url) }}
                >
                  <Glyph aria-hidden className="h-4 w-4" />
                  <span className="break-all">{link.label}</span>
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5 opacity-60" />
                </TrackedExternalLink>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
