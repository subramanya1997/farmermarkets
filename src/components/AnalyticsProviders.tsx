import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

interface AnalyticsProvidersProps {
  googleMeasurementId?: string;
  enableVercelAnalytics: boolean;
}

export function AnalyticsProviders({ googleMeasurementId, enableVercelAnalytics }: AnalyticsProvidersProps) {
  return (
    <>
      {enableVercelAnalytics ? <Analytics /> : null}
      {enableVercelAnalytics ? <SpeedInsights /> : null}
      <GoogleAnalytics measurementId={googleMeasurementId} />
    </>
  );
}
