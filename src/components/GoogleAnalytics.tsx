"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { ANALYTICS_CONSENT_KEY } from "@/lib/analytics";

interface GoogleAnalyticsProps {
  measurementId?: string;
}

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const [isLoaded, setIsLoaded] = useState(false);
  const isValidId = Boolean(measurementId && /^G-[A-Z0-9]+$/i.test(measurementId));

  useEffect(() => {
    if (!isLoaded || !isValidId || !measurementId || !window.gtag) return;
    window.gtag("config", measurementId, {
      page_path: pathname,
      anonymize_ip: true,
      send_page_view: true
    });
  }, [isLoaded, isValidId, measurementId, pathname]);

  if (!isValidId || !measurementId) return null;

  return (
    <>
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('consent', 'default', {
            analytics_storage: 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
          });
          var storedConsent = window.localStorage.getItem('${ANALYTICS_CONSENT_KEY}');
          if (storedConsent === 'granted' || storedConsent === 'denied') {
            gtag('consent', 'update', {
              analytics_storage: storedConsent,
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied'
            });
          }
          gtag('set', 'ads_data_redaction', true);
          gtag('js', new Date());
        `}
      </Script>
      <Script
        id="google-analytics-script"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
        onLoad={() => setIsLoaded(true)}
      />
    </>
  );
}
