"use client";

import type { FarmerMarket } from '@/lib/api';
import { MarketCardView } from '@/components/MarketCardView';
import { marketCardData } from '@/lib/marketCard';
import { trackEvent } from '@/lib/analytics';

interface MarketCardProps {
  market: FarmerMarket;
  /** Grid classes for the card, such as a photo card's two-column span. */
  className?: string;
}

/**
 * Explorer-grid market card: the shared `MarketCardView` design plus the
 * analytics event the interactive view reports.
 */
export function MarketCard({ market, className }: MarketCardProps) {
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');

  return (
    <MarketCardView
      card={marketCardData(market)}
      className={className}
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
