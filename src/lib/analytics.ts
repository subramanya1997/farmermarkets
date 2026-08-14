"use client";

import { track as trackVercelEvent } from "@vercel/analytics/react";

export const ANALYTICS_CONSENT_KEY = "farmermarkets.analytics-consent.v1";

export type AnalyticsConsent = "granted" | "denied";
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, consent);
  window.gtag?.("consent", "update", {
    analytics_storage: consent,
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
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
  if (getAnalyticsConsent() === "granted") {
    trackVercelEvent(name, compacted);
  }
  window.gtag?.("event", googleEventName(name), compacted);
}
