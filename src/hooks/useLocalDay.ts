'use client';

import { useSyncExternalStore } from 'react';
import { localDay } from '@/lib/offeringDays';

const noop = () => () => {};

/**
 * The viewer's own calendar day (YYYY-MM-DD). The server render and the
 * first client render use `serverDay`, so hydration matches; React then
 * re-renders with the browser's local date.
 */
export function useLocalDay(serverDay: string): string {
  return useSyncExternalStore(noop, () => localDay(), () => serverDay);
}

/** False on the server and during hydration, true once the browser has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
