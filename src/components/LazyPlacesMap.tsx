'use client';

import dynamic from 'next/dynamic';
import { preconnect } from 'react-dom';

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
    <div className="h-full w-full animate-pulse rounded-2xl border border-zinc-200 bg-[#f6f6f2] dark:border-zinc-800 dark:bg-zinc-900" />
  ),
});

/** Open the tile connection while the map's code is still downloading. */
function LazyPlacesMap(props: React.ComponentProps<typeof PlacesMap>) {
  preconnect('https://tiles.openfreemap.org', { crossOrigin: 'anonymous' });
  return <PlacesMap {...props} />;
}

export type { MapPlace } from '@/components/PlacesMap';
export { LazyPlacesMap };
