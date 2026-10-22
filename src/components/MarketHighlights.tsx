import { ArrowUpRight } from 'lucide-react';
import type { FarmerMarket } from '@/lib/api';
import type { AnalyticsProperties } from '@/lib/analytics';
import type { MarketFirstPartyFacts } from '@/lib/enrichment';
import { clean } from '@/lib/geo';
import {
  compactPublishedHours,
  eventDateBlock,
  eventDisplayState,
  eventSpan,
  marketHighlights,
  publishedLocalHours,
  rosterSubhead,
  safeHighlightUrl,
  vendorHasDetails,
} from '@/lib/marketHighlights';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';

interface MarketHighlightsProps {
  market: FarmerMarket;
  analyticsProperties: AnalyticsProperties;
}

type VendorRoster = NonNullable<NonNullable<MarketFirstPartyFacts['vendors']>['roster']>;

/** Names shown before the rest fold away. */
const VISIBLE_VENDORS = 12;

function HighlightLink({ href, children, eventName, analyticsProperties, className }: {
  href: string;
  children: React.ReactNode;
  eventName: string;
  analyticsProperties: AnalyticsProperties;
  className?: string;
}) {
  return (
    <TrackedExternalLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'inline-flex items-center gap-0.5 text-sm font-medium text-green-700 hover:underline dark:text-green-500'}
      eventName={eventName}
      eventProperties={{ ...analyticsProperties, destination_host: new URL(href).hostname }}
    >
      {children}
    </TrackedExternalLink>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">{children}</h2>;
}

const CHIP = 'inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200';

/** Name-only vendors as chips, vendors with categories or links as small cards. */
function Vendors({ roster, analyticsProperties }: { roster: VendorRoster; analyticsProperties: AnalyticsProperties }) {
  const cards = roster.filter(vendorHasDetails);
  const names = roster.filter((item) => !vendorHasDetails(item));
  return (
    <>
      {cards.length > 0 && (
        <ul className="mb-3 grid gap-2 sm:grid-cols-2">
          {cards.map((item) => {
            const vendor = item.value;
            const website = safeHighlightUrl(vendor.website);
            const social = safeHighlightUrl(vendor.social_url);
            const categories = (vendor.categories ?? []).map(clean).filter(Boolean).join(', ');
            const note = [vendor.seasonal ? 'Seasonal' : '', clean(vendor.attendance_note)].filter(Boolean).join('. ');
            return (
              <li key={item.id} className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  {website ? (
                    <HighlightLink href={website} eventName="Vendor Website Opened" analyticsProperties={analyticsProperties} className="hover:underline">
                      {clean(vendor.name)}
                    </HighlightLink>
                  ) : (
                    clean(vendor.name)
                  )}
                </p>
                {(categories || note) && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{[categories, note].filter(Boolean).join(' · ')}</p>
                )}
                {social && (
                  <HighlightLink href={social} eventName="Vendor Social Profile Opened" analyticsProperties={analyticsProperties}>
                    Social profile
                  </HighlightLink>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {names.map((item) => (
            <li key={item.id} className={CHIP}>{clean(item.value.name)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Events, programs and vendors from the market's own pages, as compact rows
 * and chips. Provenance lives once in the page footer, not on every card;
 * past events are gone, and a section with nothing left is not rendered.
 */
export function MarketHighlights({ market, analyticsProperties }: MarketHighlightsProps) {
  const { events, programs, roster, vendorLinks } = marketHighlights(market.first_party);
  const rosterContext = market.first_party?.vendors?.roster_context?.value;
  const subhead = rosterSubhead(rosterContext);
  const programCards = programs.filter((item) => clean(item.value.description) || clean(item.value.eligibility));
  const programChips = programs.filter((item) => !programCards.includes(item));
  // Without a roster the vendor links live in the visit card or the contact
  // row; a section holding only a link would repeat them.
  if (!events.length && !programs.length && !roster.length) return null;

  return (
    <div className="mt-8 space-y-8 sm:mt-10">
      {events.length > 0 && (
        <section aria-labelledby="market-events-heading">
          <SectionHeading id="market-events-heading">Events</SectionHeading>
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {events.map((item) => {
              const event = item.value;
              const href = safeHighlightUrl(event.url);
              const state = eventDisplayState(event);
              const block = eventDateBlock(event.start);
              const hours = compactPublishedHours(event.published_hours) || publishedLocalHours(event.local_hours);
              const meta = [eventSpan(event.start, event.end), hours, clean(event.venue)].filter(Boolean).join(' · ');
              const title = clean(event.name);
              return (
                <li key={item.id} className="flex gap-4 p-3 sm:p-4">
                  {block ? (
                    <time
                      dateTime={block.dateTime}
                      className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wide">{block.month}</span>
                      <span className="text-xl font-semibold leading-none tabular-nums">{block.day}</span>
                    </time>
                  ) : (
                    <span aria-hidden className="h-14 w-14 shrink-0 rounded-xl bg-zinc-50 dark:bg-zinc-800/50" />
                  )}
                  <div className="min-w-0 self-center">
                    <h3 className="font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                      {href ? (
                        <HighlightLink href={href} eventName="Market Event Details Opened" analyticsProperties={analyticsProperties} className="hover:text-green-700 hover:underline dark:hover:text-green-500">
                          {title}
                        </HighlightLink>
                      ) : (
                        title
                      )}
                      {state && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 align-middle text-xs font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                          {state}
                        </span>
                      )}
                    </h3>
                    {meta && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{meta}</p>}
                    {!block && event.start && <p className="text-sm text-zinc-600 dark:text-zinc-400">{clean(event.start)}</p>}
                    {event.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{clean(event.description)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {programs.length > 0 && (
        <section aria-labelledby="market-programs-heading">
          <SectionHeading id="market-programs-heading">Programs and activities</SectionHeading>
          {programCards.length > 0 && (
            <ul className="mb-3 grid gap-2 sm:grid-cols-2">
              {programCards.map((item) => {
                const program = item.value;
                const href = safeHighlightUrl(program.url);
                return (
                  <li key={item.id} className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-700">
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
                      {href ? (
                        <HighlightLink href={href} eventName="Market Program Details Opened" analyticsProperties={analyticsProperties} className="hover:text-green-700 hover:underline dark:hover:text-green-500">
                          {clean(program.name)}
                        </HighlightLink>
                      ) : (
                        clean(program.name)
                      )}
                    </h3>
                    {program.description && <p className="text-sm text-zinc-600 dark:text-zinc-400">{clean(program.description)}</p>}
                    {program.eligibility && <p className="text-sm text-zinc-600 dark:text-zinc-400">For {clean(program.eligibility).replace(/\.$/, '')}.</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {programChips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {programChips.map((item) => {
                const href = safeHighlightUrl(item.value.url);
                const name = clean(item.value.name);
                return (
                  <li key={item.id} className={CHIP}>
                    {href ? (
                      <HighlightLink href={href} eventName="Market Program Details Opened" analyticsProperties={analyticsProperties} className="inline-flex items-center gap-0.5 hover:text-green-700 dark:hover:text-green-500">
                        {name}
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </HighlightLink>
                    ) : (
                      name
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {roster.length > 0 && (
        <section aria-labelledby="market-vendors-heading">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="market-vendors-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
              Vendors
              {subhead && <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">{subhead}</span>}
            </h2>
            {vendorLinks.length > 0 && (
              <span className="flex flex-wrap gap-x-4">
                {vendorLinks.map((link) => (
                  <HighlightLink key={link.href} href={link.href} eventName={link.eventName} analyticsProperties={analyticsProperties}>
                    {link.label}
                    <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                  </HighlightLink>
                ))}
              </span>
            )}
          </div>
          <Vendors roster={roster.slice(0, VISIBLE_VENDORS)} analyticsProperties={analyticsProperties} />
          {roster.length > VISIBLE_VENDORS && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-green-700 dark:text-green-500">
                {roster.length - VISIBLE_VENDORS} more
              </summary>
              <div className="mt-3">
                <Vendors roster={roster.slice(VISIBLE_VENDORS)} analyticsProperties={analyticsProperties} />
              </div>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
