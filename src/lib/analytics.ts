"use client";

import { track as trackVercelEvent } from "@vercel/analytics/react";
import posthog from 'posthog-js';
import { createGoogleAnalyticsQueue } from './googleAnalyticsQueue';
import { POSTHOG_DISTINCT_ID_HEADER, POSTHOG_SESSION_ID_HEADER } from './posthogConfig';

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
  // PostHog is initialized in `instrumentation-client.ts`, and only when a
  // project token is configured.
  if (posthog.__loaded) posthog.capture(name, compacted);
}

/**
 * Headers that let a route handler attribute its server-side events to this
 * visitor's PostHog session. Empty when PostHog is not running.
 */
export function posthogRequestHeaders(): Record<string, string> {
  if (typeof window === "undefined" || !posthog.__loaded) return {};
  const sessionId = posthog.get_session_id();
  return {
    [POSTHOG_DISTINCT_ID_HEADER]: posthog.get_distinct_id(),
    ...(sessionId ? { [POSTHOG_SESSION_ID_HEADER]: sessionId } : {}),
  };
}
