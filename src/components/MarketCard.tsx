"use client";

import type { FarmerMarket } from '@/lib/api';
import { MarketCardView } from '@/components/MarketCardView';
import { trackEvent } from '@/lib/analytics';

interface MarketCardProps {
  market: FarmerMarket;
}

/**
 * Explorer-grid market card: the shared `MarketCardView` design plus the
 * analytics events the interactive view reports.
 */
export function MarketCard({ market }: MarketCardProps) {
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');
  const analyticsProperties = {
    market_id: market.id,
    market_name: market.name.slice(0, 80),
    country: market.country,
    market_type: marketType,
    source_id: market.provenance?.source_id
  };

  return (
    <MarketCardView
      market={market}
      onDetailClick={() => trackEvent('Market Detail Selected', analyticsProperties)}
      onWebsiteClick={(websiteHost) =>
        trackEvent('Official Market Website Opened', {
          ...analyticsProperties,
          destination_host: websiteHost
        })
      }
      onSocialClick={(link) =>
        trackEvent('Market Social Profile Opened', {
          ...analyticsProperties,
          platform: link.platform
        })
      }
    />
  );
}
