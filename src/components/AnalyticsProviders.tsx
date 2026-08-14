import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

interface AnalyticsProvidersProps {
  googleMeasurementId?: string;
  enableVercelAnalytics: boolean;
}

export function AnalyticsProviders({ googleMeasurementId, enableVercelAnalytics }: AnalyticsProvidersProps) {
  return (
    <>
      {enableVercelAnalytics ? <Analytics /> : null}
      <GoogleAnalytics measurementId={googleMeasurementId} />
    </>
  );
}
