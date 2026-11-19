'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { searchOperatorMarketsAction } from '@/app/(site)/for-market-operators/actions';
import { ClaimSearch } from '@/components/organizer/dashboard/ClaimSearch';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { Button, buttonVariants } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';

const SLUG = /^[a-z0-9-]+$/;
const claimHref = (slug: string) => `/markets/${encodeURIComponent(slug)}/claim`;

/**
 * The top of `/for-market-operators`: find your market and go to its claim
 * page, where the emailed code signs you in. A `?market=<slug>` on the URL
 * (outreach links) skips the search and offers that market's claim page.
 *
 * Funnel events carry counts and slugs only, never what was typed:
 * `Operator Market Search` once per visit when the first results show,
 * `Operator Market Search Empty` once when a search finds nothing,
 * `Operator Claim Click` on the way to a claim page, plus the existing
 * `Operator Account Start` on the sign-in and claim buttons.
 */
export function OperatorClaimStart() {
  const [marketSlug, setMarketSlug] = useState<string | null>(null);
  const searched = useRef(false);
  const reportedEmpty = useRef(false);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('market');
    if (!slug || !SLUG.test(slug)) return;
    // Post-hydration on purpose: the page is statically rendered, so the
    // query string is only knowable on the client, and seeding state here
    // avoids a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarketSlug(slug);
  }, []);

  const onResults = ({ count, failed, queryLength }: { count: number; failed: boolean; queryLength: number }) => {
    if (!searched.current) {
      searched.current = true;
      trackEvent('Operator Market Search', { result_count: count, failed, query_length: queryLength });
    }
    if (!failed && count === 0 && !reportedEmpty.current) {
      reportedEmpty.current = true;
      trackEvent('Operator Market Search Empty', { query_length: queryLength });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {marketSlug ? (
        <div className="flex flex-col gap-3 rounded-lg border border-green-600/30 bg-green-50 p-4 dark:border-green-500/30 dark:bg-green-900/20">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Claim the market from your link. It takes about a minute.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href={claimHref(marketSlug)}
              onClick={() => {
                trackEvent('Operator Claim Click', { source: 'market_link', market_slug: marketSlug });
                trackEvent('Operator Account Start', { has_market: true });
              }}
              className={cn(buttonVariants(), 'h-11 bg-green-700 px-6 text-white hover:bg-green-800 sm:h-9')}
            >
              Claim this listing
              <ArrowRight aria-hidden="true" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMarketSlug(null)}
              className="h-11 text-zinc-600 sm:h-9 dark:text-zinc-400"
            >
              Find a different market
            </Button>
          </div>
        </div>
      ) : (
        <ClaimSearch
          search={searchOperatorMarketsAction}
          claimHref={claimHref}
          notListedHref={null}
          onResults={onResults}
          onClaim={(market, position, resultCount) =>
            trackEvent('Operator Claim Click', {
              source: 'search',
              market_slug: market.slug,
              position,
              result_count: resultCount,
            })
          }
        />
      )}

      <div className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Not listed yet?{' '}
          <Link
            href="#list-a-market"
            onClick={() => trackEvent('Operator Not Listed Click', { has_market: Boolean(marketSlug) })}
            className={TEXT_LINK}
          >
            Ask us to add it
          </Link>
        </p>
        <p>
          Have an account?{' '}
          <Link
            href="/sign-in?next=%2Fdashboard%2Fclaim"
            onClick={() => trackEvent('Operator Account Start', { has_market: false })}
            className={TEXT_LINK}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
