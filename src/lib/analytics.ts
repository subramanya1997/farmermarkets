"use client";

import { track as trackVercelEvent } from "@vercel/analytics/react";
import { createGoogleAnalyticsQueue } from './googleAnalyticsQueue';

export { analyticsSafeSearchTerm } from './searchAnalytics';

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const googleEvents = createGoogleAnalyticsQueue();

/** Call immediately after the first GA config, so early events have a destination. */
export function flushGoogleAnalyticsEvents() {
  if (typeof window === 'undefined' || !window.gtag) return;
  googleEvents.ready((name, properties) => window.gtag?.('event', name, properties));
}

function compactProperties(properties: AnalyticsProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  ) as Record<string, string | number | boolean | null>;
}

function googleEventName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function trackEvent(name: string, properties: AnalyticsProperties = {}) {
  if (typeof window === "undefined") return;

  const compacted = compactProperties(properties);
  googleEvents.track(googleEventName(name), compacted);
  trackVercelEvent(name, compacted);
}
