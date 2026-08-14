import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";

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
  metadataBase: new URL('https://farmermarkets.app'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://farmermarkets.app',
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
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
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
  alternates: {
    canonical: 'https://farmermarkets.app',
    languages: {
      'en-US': 'https://farmermarkets.app',
    },
  },
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
    url: 'https://farmermarkets.app',
    logo: 'https://farmermarkets.app/leaf-hq.png',
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
