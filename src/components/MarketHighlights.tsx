import type { FarmerMarket } from '@/lib/api';
import type { AnalyticsProperties } from '@/lib/analytics';
import type { MarketEnrichmentSource, MarketFirstPartyFacts, SourcedValue } from '@/lib/enrichment';
import { clean } from '@/lib/geo';
import { eventDisplayState, marketHighlights, publishedEventDate, publishedLocalHours, rosterContextLabels, rosterPeriodHasEnded, safeHighlightUrl } from '@/lib/marketHighlights';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';

interface MarketHighlightsProps {
  market: FarmerMarket;
  analyticsProperties: AnalyticsProperties;
}

type VendorRoster = NonNullable<NonNullable<MarketFirstPartyFacts['vendors']>['roster']>;

function VendorCards({ roster, sources, analyticsProperties }: {
  roster: VendorRoster;
  sources?: MarketEnrichmentSource[];
  analyticsProperties: AnalyticsProperties;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {roster.map((item) => {
        const vendor = item.value;
        const website = safeHighlightUrl(vendor.website);
        const social = safeHighlightUrl(vendor.social_url);
        return (
          <li key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{clean(vendor.name)}</h3>
            {vendor.categories?.length ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{vendor.categories.map(clean).filter(Boolean).join(', ')}</p> : null}
            {vendor.seasonal && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Seasonal attendance</p>}
            {vendor.attendance_note && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{clean(vendor.attendance_note)}</p>}
            {(website || social) && <div className="mt-2 flex flex-wrap gap-3">
              {website && <HighlightLink href={website} eventName="Vendor Website Opened" analyticsProperties={analyticsProperties}>Vendor website</HighlightLink>}
              {social && <HighlightLink href={social} eventName="Vendor Social Profile Opened" analyticsProperties={analyticsProperties}>Social profile</HighlightLink>}
            </div>}
            <SourceDetails fact={item} sources={sources} analyticsProperties={analyticsProperties} />
          </li>
        );
      })}
    </ul>
  );
}

function HighlightLink({ href, children, eventName, analyticsProperties }: {
  href: string;
  children: React.ReactNode;
  eventName: string;
  analyticsProperties: AnalyticsProperties;
}) {
  return (
    <TrackedExternalLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-green-700 hover:underline dark:text-green-500"
      eventName={eventName}
      eventProperties={{ ...analyticsProperties, destination_host: new URL(href).hostname }}
    >
      {children}
    </TrackedExternalLink>
  );
}

function PublishedDate({ value }: { value: string }) {
  const formatted = publishedEventDate(value);
  return formatted
    ? <time dateTime={formatted.dateTime}>{formatted.label}</time>
    : <span>{clean(value)}</span>;
}

function SourceDetails({ fact, sources, analyticsProperties, excludeUrl }: {
  fact: Pick<SourcedValue<unknown>, 'source_ids' | 'verified_at'>;
  sources?: MarketEnrichmentSource[];
  analyticsProperties: AnalyticsProperties;
  excludeUrl?: string;
}) {
  const verified = publishedEventDate(fact.verified_at);
  const seen = new Set<string>();
  const links = (sources ?? []).flatMap((source) => {
    const href = safeHighlightUrl(source.url);
    if (!source.id || !fact.source_ids.includes(source.id) || !href || href === excludeUrl || seen.has(href)) return [];
    seen.add(href);
    return [{ href, title: clean(source.title) }];
  });
  if (!verified && !links.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
      {verified && <span>Verified <time dateTime={verified.dateTime}>{verified.label}</time></span>}
      {links.map((link) => (
        <HighlightLink key={link.href} href={link.href} eventName="Market Highlight Source Opened" analyticsProperties={analyticsProperties}>
          {link.title ? `Source: ${link.title}` : 'Source'}
        </HighlightLink>
      ))}
    </div>
  );
}

/** Source-backed events, activities and vendors; missing information adds no section. */
export function MarketHighlights({ market, analyticsProperties }: MarketHighlightsProps) {
  const { events, programs, roster, vendorLinks, attendanceIsDynamic } = marketHighlights(market.first_party);
  const sources = market.enrichment?.sources;
  const rosterContext = market.first_party?.vendors?.roster_context;
  const rosterLabels = rosterContextLabels(rosterContext?.value);
  const pastRoster = rosterPeriodHasEnded(rosterContext?.value);
  if (!events.length && !programs.length && !roster.length && !vendorLinks.length) return null;

  return (
    <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
      {events.length > 0 && (
        <section aria-labelledby="market-events-heading">
          <h2 id="market-events-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Events</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {events.map((item) => {
              const event = item.value;
              const href = safeHighlightUrl(event.url);
              const state = eventDisplayState(event);
              const hours = clean(event.published_hours) || publishedLocalHours(event.local_hours);
              return (
                <article key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{clean(event.name)}</h3>
                  {state && <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{state}</p>}
                  {event.start && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300"><PublishedDate value={event.start} /></p>}
                  {event.end && event.end !== event.start && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">Ends <PublishedDate value={event.end} /></p>}
                  {hours && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">Hours: {hours}</p>}
                  {event.venue && <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">Venue: {clean(event.venue)}</p>}
                  {event.description && <p className="mt-2 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-400">{clean(event.description)}</p>}
                  {href && <div className="mt-3"><HighlightLink href={href} eventName="Market Event Details Opened" analyticsProperties={analyticsProperties}>Event details</HighlightLink></div>}
                  <SourceDetails fact={item} sources={sources} analyticsProperties={analyticsProperties} excludeUrl={href} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {programs.length > 0 && (
        <section aria-labelledby="market-programs-heading">
          <h2 id="market-programs-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Programs and activities</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {programs.map((item) => {
              const program = item.value;
              const href = safeHighlightUrl(program.url);
              return (
                <article key={item.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{clean(program.name)}</h3>
                  {program.description && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{clean(program.description)}</p>}
                  {program.eligibility && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Eligibility: {clean(program.eligibility)}</p>}
                  {href && <div className="mt-3"><HighlightLink href={href} eventName="Market Program Details Opened" analyticsProperties={analyticsProperties}>Program details</HighlightLink></div>}
                  <SourceDetails fact={item} sources={sources} analyticsProperties={analyticsProperties} excludeUrl={href} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      {(roster.length > 0 || vendorLinks.length > 0) && (
        <section aria-labelledby="market-vendors-heading">
          <h2 id="market-vendors-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">Vendors</h2>
          {roster.length > 0 && (
            <div className="mb-3 max-w-[75ch] text-sm text-zinc-600 dark:text-zinc-400">
              <p>{pastRoster ? 'Past published roster.' : rosterContext?.value.non_exhaustive ? 'Examples from the published vendor list.' : 'Vendors listed by the market.'}</p>
              {rosterLabels.map((label) => <p key={label} className="mt-1">{label}</p>)}
              {rosterContext && <SourceDetails fact={rosterContext} sources={sources} analyticsProperties={analyticsProperties} />}
            </div>
          )}
          {attendanceIsDynamic && <p className="mb-3 max-w-[75ch] text-sm text-zinc-600 dark:text-zinc-400">Vendor attendance changes from week to week. Check the market’s current roster before visiting.</p>}
          {roster.length > 0 && !pastRoster && <VendorCards roster={roster.slice(0, 6)} sources={sources} analyticsProperties={analyticsProperties} />}
          {(pastRoster && roster.length > 0 || roster.length > 6) && (
            <details className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
              <summary className="cursor-pointer text-sm font-medium text-green-700 dark:text-green-500">
                {pastRoster ? `View past roster (${roster.length} listed vendors)` : `Show ${roster.length - 6} more listed vendors`}
              </summary>
              <div className="mt-4"><VendorCards roster={pastRoster ? roster : roster.slice(6)} sources={sources} analyticsProperties={analyticsProperties} /></div>
            </details>
          )}
          {vendorLinks.length > 0 && (
            <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
              {vendorLinks.map((link) => (
                <div key={link.label}>
                  <HighlightLink href={link.href} eventName={link.eventName} analyticsProperties={analyticsProperties}>{link.label}</HighlightLink>
                  <SourceDetails fact={link.fact} sources={sources} analyticsProperties={analyticsProperties} excludeUrl={link.href} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
