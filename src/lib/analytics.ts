"use client";

import { track as trackVercelEvent } from "@vercel/analytics/react";

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function analyticsSafeSearchTerm(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 80);
  const containsEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized);
  const containsPhoneNumber = normalized.replace(/\D/g, "").length >= 7;
  return containsEmail || containsPhoneNumber ? "[redacted]" : normalized;
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
  trackVercelEvent(name, compacted);
  window.gtag?.("event", googleEventName(name), compacted);
}
