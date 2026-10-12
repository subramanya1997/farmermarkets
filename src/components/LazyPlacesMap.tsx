'use client';

import dynamic from 'next/dynamic';

/**
 * `PlacesMap` behind a client-only import.
 *
 * Leaflet touches `window` at import time, so it cannot be server-rendered,
 * and keeping it out of the page's own chunk means the list a reader came for
 * is interactive before the map's code has even been requested. The
 * placeholder holds the map's box so nothing shifts when it arrives.
 */
const PlacesMap = dynamic(() => import('@/components/PlacesMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
  ),
});

export type { MapPlace } from '@/components/PlacesMap';
export { PlacesMap as LazyPlacesMap };
