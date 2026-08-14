"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

interface MarketDetailAnalyticsProps {
  marketId: string;
  marketName: string;
  country?: string;
  marketType?: string;
  sourceId?: string;
}

export function MarketDetailAnalytics(props: MarketDetailAnalyticsProps) {
  const trackedMarketId = useRef<string | null>(null);

  useEffect(() => {
    if (trackedMarketId.current === props.marketId) return;
    trackedMarketId.current = props.marketId;
    trackEvent("Market Detail Viewed", {
      market_id: props.marketId,
      market_name: props.marketName.slice(0, 80),
      country: props.country,
      market_type: props.marketType,
      source_id: props.sourceId
    });
  }, [props]);

  return null;
}
