"use client";

import type { FarmerMarket } from '@/lib/api';
import { MarketCardView } from '@/components/MarketCardView';
import { trackEvent } from '@/lib/analytics';

interface MarketCardProps {
  market: FarmerMarket;
}

/**
 * Explorer-grid market card: the shared `MarketCardView` design plus the
 * analytics event the interactive view reports.
 */
export function MarketCard({ market }: MarketCardProps) {
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');

  return (
    <MarketCardView
      market={market}
      onDetailClick={() =>
        trackEvent('Market Detail Selected', {
          market_id: market.id,
          market_name: market.name.slice(0, 80),
          country: market.country,
          market_type: marketType,
          source_id: market.provenance?.source_id,
        })
      }
    />
  );
}
