import type { Metadata } from "next";
import { OperatorRequestForm } from "@/components/OperatorRequestForm";
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
              Add your market to the directory, or tell us what changed on an existing listing.
              It&apos;s free, and a person reads every request.
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-white py-8 dark:bg-zinc-900 sm:py-12">
        <div className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-3xl`}>
          <OperatorRequestForm />
        </div>
      </section>
    </div>
  );
}
