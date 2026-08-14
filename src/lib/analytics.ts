"use client";

import { track as trackVercelEvent } from "@vercel/analytics/react";

export const ANALYTICS_CONSENT_KEY = "farmermarkets.analytics-consent.v1";
export const ANALYTICS_CONSENT_EVENT = "farmermarkets:analytics-consent-changed";
export const ANALYTICS_REGION_KEY = "farmermarkets.analytics-region.v1";

export const CONSENT_REQUIRED_REGIONS = [
  "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT",
  "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK"
] as const;

export type AnalyticsConsent = "granted" | "denied";
export type AnalyticsRegionStatus = "required" | "not_required";
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
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: consent }));
}

export function openAnalyticsPreferences() {
  window.localStorage.removeItem(ANALYTICS_CONSENT_KEY);
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: null }));
}

export function isConsentRequiredRegion(countryCode: string) {
  return CONSENT_REQUIRED_REGIONS.includes(
    countryCode.trim().toUpperCase() as (typeof CONSENT_REQUIRED_REGIONS)[number]
  );
}

export function getAnalyticsRegionStatus(): AnalyticsRegionStatus | null {
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(ANALYTICS_REGION_KEY);
  return stored === "required" || stored === "not_required" ? stored : null;
}

export function setAnalyticsRegionStatus(status: AnalyticsRegionStatus) {
  window.sessionStorage.setItem(ANALYTICS_REGION_KEY, status);
}

function canUseFullAnalytics() {
  const consent = getAnalyticsConsent();
  if (consent === "denied") return false;
  return consent === "granted" || getAnalyticsRegionStatus() === "not_required";
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
  if (canUseFullAnalytics()) {
    trackVercelEvent(name, compacted);
  }
  window.gtag?.("event", googleEventName(name), compacted);
}
