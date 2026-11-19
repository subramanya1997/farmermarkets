import type { Metadata } from "next";
import { OperatorClaimStart } from "@/components/OperatorClaimStart";
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

const STEPS = [
  "Find your market and tap Claim.",
  "Enter your email and the code we send you. No password.",
  "Tap your role and start updating hours, details and photos. Changes go live after a quick review.",
];

export default function MarketOperatorsPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 dark:from-green-900/20 dark:to-zinc-950 sm:py-14">
        <div className={SITE_FRAME}>
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">For market operators</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tighter sm:text-4xl">
              Claim your listing in about a minute
            </h1>
            <p className="mt-2 max-w-[75ch] text-zinc-600 dark:text-zinc-400 sm:text-lg">
              Sign in with a code we email you. No password. Update your hours, details and photos
              right away, and they go live after a quick review. It&apos;s free.
            </p>
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
              <OperatorClaimStart />
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white py-8 dark:bg-zinc-900 sm:py-12">
        <div className={`${SITE_FRAME_GUTTER} mx-auto flex w-full max-w-3xl flex-col gap-10`}>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">How claiming works</h2>
            <ol className="mt-3 flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300 sm:text-base">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div id="list-a-market" className="scroll-mt-20">
            <h2 className="text-xl font-semibold tracking-tight">Market not listed yet?</h2>
            <p className="mt-1 mb-5 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
              Tell us about it and we will add it to the directory. Then you can claim it like any other
              listing.
            </p>
            <OperatorRequestForm />
          </div>
        </div>
      </section>
    </div>
  );
}
