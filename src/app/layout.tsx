import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { SITE_URL, absoluteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });

// Search-engine ownership verification. Both values are supplied per
// deployment: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` from Search Console and
// `NEXT_PUBLIC_BING_SITE_VERIFICATION` from Bing Webmaster Tools. An unset —
// or empty — variable must emit no tag at all: Next drops an `undefined`
// value, but it would happily render `<meta name="google-site-verification"
// content="">` for an empty string, which is a broken verification claim
// rather than an absent one. The trim-to-undefined below is what prevents that.
const verificationValue = (raw?: string): string | undefined => {
  const value = raw?.trim();
  return value ? value : undefined;
};

const googleVerification = verificationValue(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION);
const bingVerification = verificationValue(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION);
const verification: Metadata['verification'] | undefined =
  googleVerification || bingVerification
    ? {
        ...(googleVerification ? { google: googleVerification } : {}),
        ...(bingVerification ? { other: { 'msvalidate.01': bingVerification } } : {}),
      }
    : undefined;

export const metadata: Metadata = {
  title: {
    default: "Farmer Markets - Find Local Fresh Produce Near You",
    template: "%s | Farmer Markets"
  },
  description: "Discover farmers markets, public food markets, cooperatives, and local-food places around the world.",
  keywords: ["farmer markets", "local produce", "fresh food", "organic", "farmers market", "local food", "farm to table"],
  authors: [{ name: "Farmer Markets" }],
  creator: "Farmer Markets",
  publisher: "Farmer Markets",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    title: 'Farmer Markets - Find Local Fresh Produce Near You',
    description: 'Discover farmers markets, public food markets, cooperatives, and local-food places around the world.',
    siteName: 'Farmer Markets',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Farmer Markets - Fresh Local Produce',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Farmer Markets - Find Local Fresh Produce Near You',
    description: 'Discover farmers markets, public food markets, cooperatives, and local-food places around the world.',
    images: ['/og-image.jpg'],
    creator: '@farmermarkets',
  },
  // NOTE: deliberately no `index: true` / `follow: true` here. A root-level
  // affirmative robots directive is inherited by every response — including
  // 404s and error pages, where it emitted `index, follow` next to Next.js's
  // own `noindex` and told crawlers to index soft 404s. Pages are indexable by
  // default without the tag, so only the snippet/preview limits are declared.
  robots: {
    googleBot: {
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon-16x16.png", sizes: "16x16" },
      { url: "/favicon-32x32.png", sizes: "32x32" },
      { url: "/leaf-hq.svg", type: "image/svg+xml" }
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
      },
    ],
  },
  manifest: '/manifest.json',
  // Spread rather than assigned: `verification: undefined` is fine today, but
  // keeping the key out entirely is what guarantees no empty meta tag is ever
  // emitted for an unset variable.
  ...(verification ? { verification } : {}),
  // NOTE: no root-level `alternates` here on purpose. A canonical set on the
  // root layout is inherited by every page that does not override it, which
  // made the whole site canonicalize to the homepage. Each page declares its
  // own self-referential canonical instead.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The site's one Organization node. It lives here, not on a page, because
  // the homepage used to emit a second copy with a different description — two
  // publishers for one site. The `@id` gives future nodes something stable to
  // point at. There is no `sameAs`: an empty array is not a fact, and we have
  // no social profiles to name yet.
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}#organization`,
    name: 'Farmer Markets',
    url: SITE_URL,
    logo: absoluteUrl('/leaf-hq.png'),
    description: 'Discover farmers markets, public food markets, cooperatives, and local-food places around the world.',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      availableLanguage: ['English'],
    },
  };

  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 w-full">
            {children}
          </main>
          <Footer />
        </div>
        <AnalyticsProviders
          googleMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-S2P5DZTJC8"}
          enableVercelAnalytics={Boolean(process.env.VERCEL)}
        />
      </body>
    </html>
  );
}
