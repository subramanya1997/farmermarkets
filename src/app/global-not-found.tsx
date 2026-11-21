import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { NotFoundContent } from "@/components/NotFoundContent";
import { SiteChrome } from "@/components/SiteChrome";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Page Not Found | Farmer Markets",
  robots: { index: false, follow: false },
};

/**
 * Unmatched URLs (`experimental.globalNotFound` in `next.config.ts`).
 *
 * Next answers these with this file directly, without the root layout, so it
 * is a whole document: the same `<html>`, font, stylesheet and analytics as
 * `src/app/layout.tsx`, and the public header and footer around the 404 body.
 *
 * It used to be `src/app/not-found.tsx` wrapped in `SiteChrome`. Next sends
 * the root not-found UI inside every page's payload, so that put a second
 * copy of the header and footer into all ~14,000 prerendered pages. A global
 * not-found page is only sent with an actual 404.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <SiteChrome>
          <NotFoundContent />
        </SiteChrome>
        <AnalyticsProviders
          googleMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-S2P5DZTJC8"}
          enableVercelAnalytics={Boolean(process.env.VERCEL)}
        />
      </body>
    </html>
  );
}
