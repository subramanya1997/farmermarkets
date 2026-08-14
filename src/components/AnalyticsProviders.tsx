"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import {
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent
} from "@/lib/analytics";

interface AnalyticsProvidersProps {
  googleMeasurementId?: string;
  enableVercelAnalytics: boolean;
}

export function AnalyticsProviders({ googleMeasurementId, enableVercelAnalytics }: AnalyticsProvidersProps) {
  const [consent, setConsentState] = useState<AnalyticsConsent | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setConsentState(getAnalyticsConsent());
    setIsReady(true);
  }, []);

  const chooseConsent = (nextConsent: AnalyticsConsent) => {
    setAnalyticsConsent(nextConsent);
    setConsentState(nextConsent);
  };

  return (
    <>
      {enableVercelAnalytics && consent === "granted" ? <Analytics /> : null}
      <GoogleAnalytics measurementId={googleMeasurementId} />

      {isReady && consent === null ? (
        <aside
          aria-label="Analytics cookie consent"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-zinc-300 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Choose your analytics cookies</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                We use Google Analytics and Vercel Analytics to understand searches, filters, survey answers, and market visits. If you allow analytics, they may store analytics cookies. If you decline, Vercel stays off and Google receives only restricted cookieless signals through Consent Mode. Advertising cookies and personalized advertising remain disabled. Read our{" "}
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
                Allow analytics cookies
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
