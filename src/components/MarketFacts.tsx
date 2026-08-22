import type { FarmerMarket } from '@/lib/api';
import type { AnalyticsProperties } from '@/lib/analytics';
import { marketFacts, socialLinks, telHref } from '@/lib/marketFacts';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';

interface MarketFactsProps {
  market: FarmerMarket;
  /** Passed straight through to the tracked outbound links. */
  analyticsProperties: AnalyticsProperties;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return undefined;
  }
}

/**
 * The facts block: one definition-list row per question this record can
 * actually answer.
 *
 * It replaces the old "Available Products" and "Payment Options" cards, which
 * between them rendered "No product information available." on 8,712 of the
 * 8,807 pages and a bulleted payment list on the rest. Here a row that has no
 * data simply is not emitted — `marketFacts()` builds only the rows the record
 * fills, and the whole block disappears for a record that fills none.
 *
 * Contact rows are built here rather than in `marketFacts()` because they are
 * links: a phone number the reader can tap, the market's own site (tracked, as
 * outbound clicks already are elsewhere on this page), and the social profiles
 * that resolve to a real URL.
 */
export function MarketFacts({ market, analyticsProperties }: MarketFactsProps) {
  const facts = marketFacts(market);

  const phones = (market.phone_numbers ?? [])
    .map((value) => ({ text: value.trim(), href: telHref(value) }))
    .filter((phone) => phone.text);
  const websites = (market.websites ?? []).filter((url) => /^https?:\/\//i.test(url)).slice(0, 2);
  const socials = socialLinks(market.social_media);
  const richLinks = [
    market.first_party?.vendors?.directory_url
      ? { label: 'Vendor directory', url: market.first_party.vendors.directory_url.value, event: 'Vendor Directory Opened' }
      : undefined,
    market.first_party?.vendors?.weekly_roster_url
      ? { label: 'Weekly vendor roster', url: market.first_party.vendors.weekly_roster_url.value, event: 'Vendor Roster Opened' }
      : undefined,
    market.first_party?.access?.market_map_url
      ? { label: 'Market map', url: market.first_party.access.market_map_url.value, event: 'Market Map Opened' }
      : undefined,
    market.first_party?.contact?.newsletter
      ? {
          label: market.first_party.contact.newsletter.value.name || 'Get market updates',
          url: market.first_party.contact.newsletter.value.signup_url,
          event: 'Market Newsletter Opened',
        }
      : undefined,
  ].filter((link): link is { label: string; url: string; event: string } => Boolean(link));

  if (!facts.length && !phones.length && !websites.length && !socials.length && !richLinks.length) return null;

  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="market-facts-heading">
      <h2
        id="market-facts-heading"
        className="text-lg sm:text-xl font-semibold tracking-tight mb-3"
      >
        Market details
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-zinc-200 p-4 sm:grid-cols-2 sm:p-6 2xl:grid-cols-3 dark:border-zinc-700">
        {facts.map((fact) => (
          <div key={fact.term}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {fact.term}
            </dt>
            <dd className="mt-1 text-sm sm:text-base text-zinc-800 dark:text-zinc-200">
              {fact.values.join(', ')}
              {fact.note && (
                <span className="mt-1 block text-sm text-zinc-600 dark:text-zinc-400">
                  {fact.note}
                </span>
              )}
            </dd>
          </div>
        ))}

        {phones.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Phone
            </dt>
            <dd className="mt-1 text-sm sm:text-base text-zinc-800 dark:text-zinc-200">
              {phones.map((phone, index) => (
                <span key={phone.text}>
                  {index > 0 && ', '}
                  {phone.href ? (
                    <a
                      href={phone.href}
                      className="text-green-700 hover:underline dark:text-green-500"
                    >
                      {phone.text}
                    </a>
                  ) : (
                    phone.text
                  )}
                </span>
              ))}
            </dd>
          </div>
        )}

        {websites.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Website
            </dt>
            <dd className="mt-1 text-sm sm:text-base">
              {websites.map((url, index) => (
                <span key={url}>
                  {index > 0 && ', '}
                  <TrackedExternalLink
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-green-700 hover:underline dark:text-green-500"
                    eventName="Official Market Website Opened"
                    eventProperties={{
                      ...analyticsProperties,
                      destination_host: hostOf(url),
                    }}
                  >
                    {hostOf(url) ?? url}
                  </TrackedExternalLink>
                </span>
              ))}
            </dd>
          </div>
        )}

        {socials.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Social
            </dt>
            <dd className="mt-1 text-sm sm:text-base">
              {socials.map((social, index) => (
                <span key={social.href}>
                  {index > 0 && ', '}
                  <TrackedExternalLink
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:underline dark:text-green-500"
                    eventName="Market Social Profile Opened"
                    eventProperties={{
                      ...analyticsProperties,
                      destination_host: hostOf(social.href),
                    }}
                  >
                    {social.label}
                  </TrackedExternalLink>
                </span>
              ))}
            </dd>
          </div>
        )}

        {richLinks.length > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Plan your visit
            </dt>
            <dd className="mt-1 text-sm sm:text-base">
              {richLinks.map((link, index) => (
                <span key={`${link.label}:${link.url}`}>
                  {index > 0 && ', '}
                  <TrackedExternalLink
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-700 hover:underline dark:text-green-500"
                    eventName={link.event}
                    eventProperties={{
                      ...analyticsProperties,
                      destination_host: hostOf(link.url),
                    }}
                  >
                    {link.label}
                  </TrackedExternalLink>
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
