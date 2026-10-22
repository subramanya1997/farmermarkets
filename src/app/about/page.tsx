import Link from "next/link";
import type { Metadata } from "next";
import { SITE_FRAME_GUTTER } from "@/lib/ui";

const DESCRIPTION =
  "A free directory of farmers markets and public local-food places, built from USDA and government open data.";

export const metadata: Metadata = {
  title: "About Farmer Markets",
  description: DESCRIPTION,
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: "About Farmer Markets",
    description: DESCRIPTION,
    url: '/about',
  },
};

const LINK = "font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300";

export default function AboutPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white dark:bg-zinc-900">
      <div className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-2xl py-12 sm:py-16`}>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          About Farmer Markets
        </h1>
        <div className="mt-6 space-y-5 text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p>
            Farmer Markets is a free directory of farmers markets and other public local-food
            places, from market halls and food co-ops to community gardens and hawker centres. Each
            listing shows where a market is, when it runs, what it sells and which payment and food
            assistance programs it takes, wherever the source data says so.
          </p>
          <p>
            It is for anyone deciding where to shop this week, paying with{' '}
            <Link href="/farmers-markets/snap-ebt" className={LINK}>
              SNAP, WIC or FMNP
            </Link>
            , or looking for a market in a new city. If you run a market, you can{' '}
            <Link href="/for-market-operators" className={LINK}>
              add or correct your listing
            </Link>
            .
          </p>
          <p>
            Listings come from the USDA Local Food Portal and official government open-data
            portals. The site is independent and not affiliated with the USDA or any of those
            publishers.{' '}
            <Link href="/about-the-data" className={LINK}>
              About the data
            </Link>{' '}
            lists every source and how current each record is.
          </p>
        </div>
      </div>
    </div>
  );
}
