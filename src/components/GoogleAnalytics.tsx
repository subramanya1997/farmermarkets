"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { flushGoogleAnalyticsEvents } from '@/lib/analytics';

interface GoogleAnalyticsProps {
  measurementId?: string;
}

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const [isLoaded, setIsLoaded] = useState(false);
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

  if (!isValidId || !measurementId) return null;

  return (
      <Script
        id="google-analytics-script"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
        onReady={() => setIsLoaded(true)}
      />
  );
}
