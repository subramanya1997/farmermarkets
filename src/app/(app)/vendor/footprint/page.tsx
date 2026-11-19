import type { Metadata } from 'next';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { getVendorForUser } from '@/lib/vendors';
import { vendorFootprint } from '@/lib/vendorReach';
import { vendorPagePublic } from '@/lib/vendorRules';
import { qrSvg, scanUrl } from '@/lib/vendorQr';
import { PageHeader } from '@/components/dashboard/DocBits';
import { FootprintChart } from '@/components/vendor/FootprintChart';
import { Callout, LINK } from '@/components/vendor/bits';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Footprint',
  robots: { index: false, follow: false },
};

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-xs sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">{value.toLocaleString('en-US')}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
    </div>
  );
}

export default async function VendorFootprintPage() {
  const user = await requireOrganizer('/vendor/footprint');
  const vendor = await getVendorForUser(user.id);
  const live = vendor ? vendorPagePublic({ hasLiveProfile: vendor.profile !== null, suspended: vendor.suspendedAt !== null }) : false;
  const [footprint, svg] = await Promise.all([vendorFootprint(user), vendor && live ? qrSvg(vendor.slug) : Promise.resolve(null)]);
  const url = vendor && live ? scanUrl(vendor.slug) : null;
  const download = cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-base sm:h-10 sm:flex-none sm:text-sm');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Footprint">Your stall QR code, and how many shoppers scan it and follow you.</PageHeader>

      {svg && url ? (
        <section aria-labelledby="qr-heading" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div
              role="img"
              aria-label="Your stall QR code"
              className="size-48 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-white [&>svg]:size-full dark:border-zinc-700"
              // Generated on this server by the qrcode library from our own URL; no user text inside.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="flex w-full min-w-0 flex-col gap-3">
              <h2 id="qr-heading" className="text-lg font-semibold tracking-tight">
                Your stall QR code
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Print it and put it on your table. A scan opens your page with what you are bringing and a Follow button. Print it at least 2 inches wide.
              </p>
              <p className="text-sm break-all text-zinc-500 dark:text-zinc-400">{url.replace(/^https?:\/\//, '')}</p>
              <div className="flex gap-2">
                <a href="/vendor/footprint/qr?format=png" download className={download}>
                  <Download aria-hidden="true" />
                  PNG
                </a>
                <a href="/vendor/footprint/qr?format=svg" download className={download}>
                  <Download aria-hidden="true" />
                  SVG
                </a>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <Callout tone="info" title="Your QR code is ready once your page is live">
          We check every new page.{' '}
          <Link href="/vendor/profile" className={LINK}>
            See your profile
          </Link>
        </Callout>
      )}

      {footprint ? (
        <section aria-labelledby="reach-heading" className="space-y-3">
          <h2 id="reach-heading" className="text-lg font-semibold tracking-tight">
            Reach
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat label="Scans" value={footprint.totals.scans30} hint="Last 30 days" />
            <Stat label="Followers" value={footprint.totals.follows} hint={`${footprint.totals.follows30.toLocaleString('en-US')} new`} />
            <Stat label="All scans" value={footprint.totals.scans} hint="Since the start" />
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <FootprintChart hours={footprint.hours} serverToday={new Date().toISOString().slice(0, 10)} />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Counts only. We never show who scanned or follows, and repeat scans from the same phone within 30 minutes count once.
          </p>
        </section>
      ) : null}
    </div>
  );
}
