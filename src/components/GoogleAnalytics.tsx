"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { flushGoogleAnalyticsEvents } from '@/lib/analytics';
import { isAutomatedBrowser } from '@/lib/automatedBrowser';

interface GoogleAnalyticsProps {
  measurementId?: string;
}

const subscribeNever = () => () => {};
const isHumanBrowser = () => !isAutomatedBrowser();
const serverSnapshot = () => false;

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const [isLoaded, setIsLoaded] = useState(false);
  // False on the server and during hydration, so both render the same markup;
  // the tag loads afterInteractive anyway. Self-declared headless browsers
  // never get it.
  const isAllowed = useSyncExternalStore(subscribeNever, isHumanBrowser, serverSnapshot);
  const initialized = useRef(false);
  const isValidId = Boolean(measurementId && /^G-[A-Z0-9]+$/i.test(measurementId));

  useEffect(() => {
    if (!isLoaded || !isValidId || !measurementId) return;
    window.dataLayer = window.dataLayer || [];
    // Keep the Google tag's documented command format (an Arguments object).
    // eslint-disable-next-line prefer-rest-params
    window.gtag = window.gtag || function () { window.dataLayer?.push(arguments); };
    if (!initialized.current) {
      window.gtag('set', 'ads_data_redaction', true);
      window.gtag('js', new Date());
      initialized.current = true;
    }
    window.gtag("config", measurementId, {
      page_path: pathname,
      anonymize_ip: true,
      send_page_view: true
    });
    flushGoogleAnalyticsEvents();
  }, [isLoaded, isValidId, measurementId, pathname]);

  if (!isValidId || !measurementId || !isAllowed) return null;

  return (
      <Script
        id="google-analytics-script"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
        onReady={() => setIsLoaded(true)}
      />
  );
}
