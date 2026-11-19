import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { SITE_FRAME, SITE_FRAME_GUTTER } from '@/lib/ui';
import { cn } from '@/lib/utils';

export const revalidate = 86400;

const TITLE = 'For Vendors - A Free Page for Your Farm or Food Business';
const DESCRIPTION =
  'Sell at farmers markets? Make a free vendor page with your photos and what you sell, apply to markets, and get listed on the market pages shoppers read.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/for-vendors' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/for-vendors' },
};

const STEPS = [
  {
    title: 'Sign in with your email',
    body: 'We send you a six digit code. No password to remember.',
  },
  {
    title: 'Name, what you sell, and where',
    body: 'One short screen: your business name, what you sell, and the markets you sell at. Photos and the rest can wait.',
  },
  {
    title: 'Get listed',
    body: 'We check your page and each market approves you. If a market needs a permit or insurance, you add it after you apply.',
  },
];

const START_HREF = '/sign-in?next=%2Fvendor';

export default function ForVendorsPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 sm:py-14 dark:from-green-900/20 dark:to-zinc-950">
        <div className={SITE_FRAME}>
          <div className="mx-auto max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">For Vendors</h1>
            <p className="mt-2 max-w-[75ch] text-zinc-600 sm:text-lg dark:text-zinc-400">
              Farms, bakers and makers who sell at farmers markets can have their own page here. It shows what you
              sell, your photos and the markets where shoppers can find you, and each of those markets lists you
              on its page. It&apos;s free.
            </p>
            <div className="mt-6">
              <Link
                href={START_HREF}
                rel="nofollow"
                className={cn(buttonVariants(), 'h-12 w-full rounded-full bg-green-700 px-6 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:text-sm')}
              >
                Start your vendor page
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full bg-white py-8 sm:py-12 dark:bg-zinc-900">
        <div className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-3xl`}>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">How it works</h2>
          <ol className="mt-4 space-y-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-green-50 text-sm font-semibold text-green-900 dark:bg-green-950/40 dark:text-green-100"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium text-zinc-900 dark:text-zinc-100">{step.title}</h3>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="mt-8 text-lg font-semibold tracking-tight sm:text-xl">Before it goes live</h2>
          <p className="mt-2 max-w-[75ch] text-zinc-600 dark:text-zinc-400">
            A person reviews every vendor page before it goes live, and each market decides who it lists. Once a
            market approves you, your page shows the market and the market&apos;s page shows you.
          </p>

          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Run a market instead?{' '}
            <Link
              href="/for-market-operators"
              className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
            >
              See the page for market operators
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
