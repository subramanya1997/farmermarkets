import type { FarmerMarket } from '@/lib/api';
import { MarketCardView } from '@/components/MarketCardView';

interface MarketSummaryCardProps {
  market: FarmerMarket;
}

/**
 * Server-rendered market card for the crawlable index.
 *
 * Deliberately *not* `MarketCard`: that one is a client component, so every
 * card on a 48-card page would mount JS purely to fire analytics click events.
 * This renders the same shared `MarketCardView` as plain HTML — the stretched
 * title link is exactly the anchor a crawler needs to reach the detail page.
 */
export function MarketSummaryCard({ market }: MarketSummaryCardProps) {
  return <MarketCardView market={market} />;
}
