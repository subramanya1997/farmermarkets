import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { SITE_URL, absoluteUrl } from "@/lib/site";

const inter = Inter({ subsets: ["latin"] });

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
  // Organization Schema for SEO
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Farmer Markets',
    url: SITE_URL,
    logo: absoluteUrl('/leaf-hq.png'),
    description: 'Discover farmers markets, public food markets, cooperatives, and local-food places around the world.',
    sameAs: [
      // Add social media profiles here when available
    ],
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
