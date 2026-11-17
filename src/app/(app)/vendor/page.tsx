import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, ChevronRight, FileText, MapPin, Store } from 'lucide-react';
import { SuggestedList } from '@/components/vendor/SuggestedMarkets';
import { requireOrganizer } from '@/lib/organizer';
import { absoluteUrl } from '@/lib/site';
import type { MarketRef, VendorOverview } from '@/lib/vendors';
import { buttonVariants } from '@/components/ui/button';
import { Callout, NoteFrom, PRIMARY, plural } from '@/components/vendor/bits';
import { cn } from '@/lib/utils';
import { cachedVendorOverview, needsDocument } from './_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Vendor',
  robots: { index: false, follow: false },
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}

type StepTone = 'done' | 'attention' | 'waiting' | 'todo';

interface Step {
  href: string;
  title: string;
  icon: ReactNode;
  status: string;
  tone: StepTone;
  detail?: ReactNode;
}

function profileStep(overview: VendorOverview): Step {
  const base = { href: '/vendor/profile', title: 'Your profile', icon: <Store /> };
  switch (overview.state) {
    case 'none':
      return { ...base, status: 'Not started', tone: 'todo' };
    case 'draft':
      return { ...base, status: 'Draft. Not sent for review yet.', tone: 'todo' };
    case 'pending':
      return {
        ...base,
        status: overview.live ? 'Live. Your changes are waiting for review.' : 'Waiting for review. We usually decide within two business days.',
        tone: 'waiting',
      };
    case 'approved':
      return { ...base, status: overview.suspended ? 'Approved, but taken down' : 'Live', tone: overview.suspended ? 'attention' : 'done' };
    case 'rejected':
      return {
        ...base,
        status: overview.live ? 'Live. Your last changes need a fix.' : 'Needs a fix before it can go live',
        tone: 'attention',
        detail: overview.reviewNote ? <NoteFrom who="Note from our team">{overview.reviewNote}</NoteFrom> : undefined,
      };
  }
}

function marketsStep(overview: VendorOverview): Step {
  const base = { href: '/vendor/markets', title: 'Your markets', icon: <MapPin /> };
  const open = overview.applications.filter((application) => application.market && (application.status === 'pending' || application.status === 'approved'));
  const listed = open.filter((application) => application.status === 'approved').length;
  const waiting = open.filter((application) => application.status === 'pending').length;
  const missing = overview.applications.filter(needsDocument).length;
  if (open.length === 0) {
    return { ...base, status: 'Pick the markets you sell at and apply in a few taps.', tone: 'todo' };
  }
  const parts = [listed ? `Listed at ${plural(listed, 'market', 'markets')}` : null, waiting ? `${waiting} waiting` : null].filter(Boolean);
  if (missing > 0) {
    return { ...base, status: `${parts.join(', ')}. ${missing === 1 ? '1 needs a document.' : `${missing} need a document.`}`, tone: 'attention' };
  }
  return { ...base, status: `${parts.join(', ')}.`, tone: listed > 0 && waiting === 0 ? 'done' : 'waiting' };
}

function documentsStep(overview: VendorOverview): Step {
  const base = { href: '/vendor/documents', title: 'Your documents', icon: <FileText /> };
  const count = overview.documents.length;
  const expired = overview.documents.filter((document) => document.expired).length;
  if (count === 0) {
    return {
      ...base,
      status: overview.documentsEnabled
        ? 'Keep permits and insurance here once, then attach them to any market.'
        : 'Document uploads are coming soon.',
      tone: 'todo',
    };
  }
  return {
    ...base,
    status: `${plural(count, 'document', 'documents')} in your locker${expired ? `, ${expired} expired` : ''}.`,
    tone: expired ? 'attention' : 'done',
  };
}

export default async function VendorHomePage() {
  const user = await requireOrganizer('/vendor');
  const overview = await cachedVendorOverview(user);
  const name = firstName(user.name);
  const business = overview.live?.name || overview.draft.name;

  if (overview.state === 'none' && overview.applications.length === 0 && overview.documents.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Welcome name={name} />
        <Suggested markets={overview.suggestedMarkets} />
      </div>
    );
  }

  const steps = [profileStep(overview), marketsStep(overview), documentsStep(overview)];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        {/* The business name leads: invited accounts carry it as the account name too. */}
        <h1 className="text-2xl font-semibold tracking-tight break-words">{business || (name ? `Hi, ${name}` : 'Welcome back')}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Here is where things stand.</p>
      </div>

      {overview.suspended ? (
        <Callout tone="problem" title="Your public page is taken down">
          Shoppers cannot see your profile or your market listings right now. If you think this is a mistake, reply to the email we sent you.
        </Callout>
      ) : null}

      {overview.publicPath ? <LiveCard href={overview.publicPath} /> : null}

      <ol className="space-y-3" aria-label="Your setup">
        {steps.map((step, index) => (
          <li key={step.href}>
            <StepRow step={step} number={index + 1} />
          </li>
        ))}
      </ol>

      <Suggested markets={overview.suggestedMarkets} />
    </div>
  );
}

function Welcome({ name }: { name: string }) {
  const steps = [
    { title: 'Tell shoppers about you', body: 'Your name, what you sell and a few photos. We check it once.' },
    { title: 'Apply to your markets', body: 'Pick a market, choose your days, attach any permits it asks for.' },
    { title: 'Show up on their pages', body: 'Once approved, you are listed on each market’s page with a link to yours.' },
  ];
  return (
    <section aria-labelledby="welcome" className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="bg-gradient-to-br from-green-50 to-white px-5 pt-6 pb-5 sm:px-6 dark:from-green-950/40 dark:to-zinc-900">
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full bg-green-700 text-white shadow-xs ring-4 ring-green-100 dark:ring-green-900/50"
        >
          <Store className="size-5" />
        </span>
        <h1 id="welcome" className="mt-4 text-2xl font-semibold tracking-tight">
          {name ? `Welcome, ${name}` : 'Welcome'}
        </h1>
        <p className="mt-1.5 text-[15px] leading-6 text-zinc-700 dark:text-zinc-300">
          Sell at a farmers market? Set up your profile once and shoppers can find you at every market you sell at.
        </p>
      </div>
      <ol className="space-y-4 px-5 py-5 sm:px-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-medium">{step.title}</h2>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t border-zinc-200 px-5 py-4 sm:px-6 dark:border-zinc-800">
        <Link href="/vendor/profile" className={cn(buttonVariants(), PRIMARY)}>
          Set up your profile
          <ChevronRight aria-hidden="true" />
        </Link>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Takes about five minutes. You can apply to markets while we review it.</p>
      </div>
    </section>
  );
}

const STEP_BADGE: Record<StepTone, string> = {
  done: 'bg-green-700 text-white dark:bg-green-600',
  attention: 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-700',
  waiting: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900',
  todo: 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
};

const STEP_STATUS: Record<StepTone, string> = {
  done: 'text-green-800 dark:text-green-300',
  attention: 'text-amber-900 dark:text-amber-200',
  waiting: 'text-zinc-700 dark:text-zinc-300',
  todo: 'text-zinc-600 dark:text-zinc-400',
};

function StepRow({ step, number }: { step: Step; number: number }) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-white shadow-xs dark:bg-zinc-900',
        step.tone === 'attention' ? 'border-amber-300 dark:border-amber-800' : 'border-zinc-200 dark:border-zinc-800',
      )}
    >
      <Link
        href={step.href}
        className="flex min-h-16 items-center gap-3 rounded-xl px-4 py-3.5 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-700 sm:px-5 dark:hover:bg-zinc-800/50"
      >
        <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold', STEP_BADGE[step.tone])}>
          {step.tone === 'done' ? <Check className="size-4" /> : number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-50">
            <span aria-hidden="true" className="flex text-zinc-400 [&_svg]:size-4">
              {step.icon}
            </span>
            {step.title}
          </span>
          <span className={cn('mt-0.5 block text-sm break-words', STEP_STATUS[step.tone])}>{step.status}</span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-zinc-400" />
      </Link>
      {step.detail ? <div className="px-4 pb-4 sm:px-5">{step.detail}</div> : null}
    </div>
  );
}

function LiveCard({ href }: { href: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-green-200 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-green-900/60 dark:bg-green-950/30">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-green-600 ring-4 ring-green-200 dark:bg-green-400 dark:ring-green-900" />
        <div className="min-w-0">
          <p className="font-medium text-green-950 dark:text-green-100">Your page is live</p>
          <p className="text-sm break-all text-green-900/80 dark:text-green-200/80">{absoluteUrl(href).replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
      <Link
        href={href}
        target="_blank"
        rel="noopener"
        className={cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full border-green-300 bg-white text-base sm:h-10 sm:w-auto sm:text-sm dark:border-green-800 dark:bg-zinc-950')}
      >
        View your page
        <ArrowUpRight aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </Link>
    </div>
  );
}

function Suggested({ markets }: { markets: MarketRef[] }) {
  if (markets.length === 0) return null;
  return (
    <section aria-labelledby="suggested" className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      <div className="px-4 pt-4 sm:px-5">
        <h2 id="suggested" className="text-base font-semibold">
          {markets.length === 1 ? 'A market you sell at' : 'Markets you sell at'}
        </h2>
        <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">We noted these from your invite. Apply to be listed on each one. It only takes a minute.</p>
      </div>
      <SuggestedList markets={markets} />
    </section>
  );
}
