import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { OperatorRequestForm } from "@/components/OperatorRequestForm";
import { ClipboardList, BadgeCheck, Sparkles } from "lucide-react";
import { SITE_FRAME, SITE_FRAME_GUTTER } from "@/lib/ui";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "For Market Operators - List or Claim Your Farmers Market",
  description:
    "Run a farmers market? Get your market listed in the directory, or claim and correct an existing listing. Free for market operators.",
  alternates: {
    canonical: '/for-market-operators',
  },
  openGraph: {
    title: "For Market Operators - List or Claim Your Farmers Market",
    description:
      "Run a farmers market? Get your market listed in the directory, or claim and correct an existing listing. Free for market operators.",
    url: '/for-market-operators',
  },
};

export default function MarketOperatorsPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 dark:from-green-900/20 dark:to-zinc-950 sm:py-14">
        <div className={SITE_FRAME}>
          <div className="mx-auto max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">
              For Market Operators
            </h1>
            <p className="mt-2 max-w-[75ch] text-zinc-600 dark:text-zinc-400 sm:text-lg">
              If you run a farmers market or another local-food place, this directory is how
              shoppers find you. Listing is free, and so is fixing what we have on file.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-white py-8 dark:bg-zinc-900 sm:py-12">
        <div className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-3xl`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <ClipboardList className="h-6 w-6 text-green-600" />
                <h2 className="mt-3 text-lg font-semibold">List your market</h2>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  Not in the directory yet? Send us your market&apos;s name, location, schedule,
                  and website, and we will add it to the listings shoppers browse and search.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <BadgeCheck className="h-6 w-6 text-green-600" />
                <h2 className="mt-3 text-lg font-semibold">Claim or correct a listing</h2>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  Much of the directory comes from official government data, and details drift.
                  Tell us what changed, whether hours, seasons, payment options, or anything
                  else, and we will bring your listing up to date.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4 border-green-600/20 bg-green-50/60 dark:border-green-500/20 dark:bg-green-900/10">
            <CardContent className="p-5">
              <Sparkles className="h-6 w-6 text-green-600" />
              <h2 className="mt-3 text-lg font-semibold">Coming next: operator accounts</h2>
              <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                We are building direct claiming, so verified operators can manage their own
                listing, keep schedules current, and add photos and announcements. Requests sent
                through this page put your market first in line when that launches.
              </p>
            </CardContent>
          </Card>

          <div className="mt-10">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Send your request</h2>
            <p className="mb-5 mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              A person reads every request. Most listing additions and corrections land within a
              few days.
            </p>
            <OperatorRequestForm />
          </div>
        </div>
      </section>
    </div>
  );
}
