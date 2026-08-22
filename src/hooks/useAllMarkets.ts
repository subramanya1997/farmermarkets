'use client';

import { useEffect, useState } from 'react';
import type { FarmerMarket } from '@/lib/api';

/** Matches `MAX_LIMIT` in `src/app/api/markets/route.ts`. */
const FETCH_LIMIT = 1000;

interface MarketsApiResponse {
  data: FarmerMarket[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

async function fetchMarketsPage(page: number, signal: AbortSignal): Promise<MarketsApiResponse> {
  const response = await fetch(
    `/api/markets?fields=slim&limit=${FETCH_LIMIT}&page=${page}`,
    { signal }
  );
  if (!response.ok) {
    throw new Error(`/api/markets returned ${response.status}`);
  }
  return (await response.json()) as MarketsApiResponse;
}

export interface UseAllMarketsResult {
  markets: FarmerMarket[];
  loading: boolean;
  error: string | null;
}

/**
 * The dataset for the interactive map/filter view.
 *
 * `/markets` used to serialize all 8,807 records into its RSC payload, which is
 * what made the page a 16.6 MB HTML response with no links in it. The server
 * now renders a paginated, link-based index and this hook pulls the data the
 * *interactive* view needs over the network instead — slim records, in parallel
 * pages, and only once the reader opens the explorer.
 *
 */
export function useAllMarkets(): UseAllMarketsResult {
  const [markets, setMarkets] = useState<FarmerMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const first = await fetchMarketsPage(1, controller.signal);
        if (cancelled) return;
        // Show the first slice immediately; the rest streams in behind it.
        setMarkets(first.data);

        const totalPages = first.pagination.totalPages;
        if (totalPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              fetchMarketsPage(index + 2, controller.signal)
            )
          );
          if (cancelled) return;
          setMarkets([...first.data, ...rest.flatMap((response) => response.data)]);
        }
        setLoading(false);
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : 'Failed to load markets');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { markets, loading, error };
}
