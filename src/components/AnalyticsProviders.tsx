"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsConsent,
  getAnalyticsRegionStatus,
  isConsentRequiredRegion,
  setAnalyticsConsent,
  setAnalyticsRegionStatus,
  type AnalyticsConsent,
  type AnalyticsRegionStatus
} from "@/lib/analytics";

interface AnalyticsProvidersProps {
  googleMeasurementId?: string;
  enableVercelAnalytics: boolean;
}

export function AnalyticsProviders({ googleMeasurementId, enableVercelAnalytics }: AnalyticsProvidersProps) {
  const [consent, setConsentState] = useState<AnalyticsConsent | null>(null);
  const [regionStatus, setRegionStatus] = useState<AnalyticsRegionStatus | null>(null);
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const syncConsent = (event?: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      setConsentState(getAnalyticsConsent());
      if (detail === null) setPreferencesOpen(true);
    };

    syncConsent();
    setRegionStatus(getAnalyticsRegionStatus());
    window.addEventListener(ANALYTICS_CONSENT_EVENT, syncConsent);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    fetch("https://ipapi.co/country_code/", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Region lookup failed: ${response.status}`);
        return response.text();
      })
      .then((countryCode) => {
        const nextStatus = isConsentRequiredRegion(countryCode) ? "required" : "not_required";
        setAnalyticsRegionStatus(nextStatus);
        setRegionStatus(nextStatus);
      })
      .catch(() => {
        setAnalyticsRegionStatus("required");
        setRegionStatus("required");
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, syncConsent);
    };
  }, []);

  const chooseConsent = (nextConsent: AnalyticsConsent) => {
    setAnalyticsConsent(nextConsent);
    setConsentState(nextConsent);
    setPreferencesOpen(false);
  };

  const fullAnalyticsAllowed = consent === "granted"
    || (consent === null && regionStatus === "not_required");
  const shouldShowPreferences = preferencesOpen
    || (regionStatus === "required" && consent === null);

  return (
    <>
      {enableVercelAnalytics && fullAnalyticsAllowed ? <Analytics /> : null}
      <GoogleAnalytics measurementId={googleMeasurementId} />

      {shouldShowPreferences ? (
        <aside
          aria-label="Analytics preferences"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-zinc-300 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Analytics choices</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Google&apos;s tag loads with restricted, cookieless measurement. Allow analytics to enable analytics cookies and full measurement. Advertising storage and personalization remain disabled. Read our{" "}
                <Link href="/privacy" className="text-green-700 underline dark:text-green-400">privacy policy</Link>.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => chooseConsent("denied")}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => chooseConsent("granted")}
                className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Allow analytics
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
