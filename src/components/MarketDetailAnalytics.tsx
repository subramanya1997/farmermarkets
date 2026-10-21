"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import { setPageExtras } from "@/lib/pageContext";

interface MarketDetailAnalyticsProps {
  marketId: string;
  marketName: string;
  country?: string;
  marketType?: string;
  sourceId?: string;
  /** Geo-index slugs, when the market was placed in a city. */
  stateSlug?: string;
  citySlug?: string;
}

export function MarketDetailAnalytics(props: MarketDetailAnalyticsProps) {
  const trackedMarketId = useRef<string | null>(null);

  useEffect(() => {
    if (trackedMarketId.current === props.marketId) return;
    trackedMarketId.current = props.marketId;
    // The URL names only the market; this lets every later event on the page
    // (website, directions, phone) be split by state and city too.
    setPageExtras(window.location.pathname, { page_state: props.stateSlug, page_city: props.citySlug });
    trackEvent("Market Detail Viewed", {
      market_id: props.marketId,
      market_name: props.marketName.slice(0, 80),
      country: props.country,
      market_type: props.marketType,
      source_id: props.sourceId,
      state: props.stateSlug,
      city: props.citySlug
    });
  }, [props]);

  return null;
}
