import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import { ArrowRight, MapPin } from 'lucide-react';
import { FollowVendorCard } from '@/components/FollowVendorCard';
import { VendorOfferingBlock } from '@/components/VendorOffering';
import { vendorSellsLine } from '@/components/VendorBits';
import { getMarketById } from '@/lib/data';
import { clean } from '@/lib/geo';
import { usToday } from '@/lib/offeringDays';
import { getSessionUser } from '@/lib/organizer';
import { displayName } from '@/lib/seo';
import { SITE_FRAME } from '@/lib/ui';
import { getPublishedVendorBySlug } from '@/lib/vendorLayer';
import { followState, recordScan } from '@/lib/vendorReach';
import { attendanceLabel } from '@/lib/vendorRules';

/**
 * The stall QR code lands here. Each visit is recorded as a scan (after the
 * response, bots and repeat visits skipped) and the page shows what the
 * shopper needs at the stall: who this is, what they have today, and a
 * one-step follow. Never indexed; the vendor page is the canonical one.
 */
export const dynamic = 'force-dynamic';

interface ScanPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ScanPageProps): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await getPublishedVendorBySlug(slug).catch(() => null);
  return {
    title: vendor ? clean(vendor.profile.name) : 'Vendor Not Found',
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    ...(vendor ? { alternates: { canonical: `/vendors/${vendor.slug}` } } : {}),
  };
}

export default async function ScanPage({ params }: ScanPageProps) {
  const { slug } = await params;
  const vendor = await getPublishedVendorBySlug(slug).catch(() => null);
  if (!vendor) notFound();

  const requestHeaders = await headers();
  const scanHeaders = new Headers(requestHeaders);
  const user = await getSessionUser();
  const [state, markets] = await Promise.all([
    followState(user, vendor.id).catch(() => ({ signedIn: Boolean(user), following: false, own: false })),
    Promise.all(
      vendor.markets.map(async (entry) => {
        const market = await getMarketById(entry.marketId);
        return market?.slug
          ? {
              slug: market.slug,
              name: displayName(market.name),
              place: [clean(market.city), clean(market.state)].filter(Boolean).join(', '),
              when: [attendanceLabel(entry.days), clean(entry.stallNote)].filter(Boolean).join(' · '),
              offerings: entry.offerings,
            }
          : null;
      }),
    ),
  ]);
  // The vendor checking their own code is not a shopper scan.
  if (!state.own) after(() => recordScan(vendor.id, { headers: scanHeaders }));
  const listed = markets.filter((market): market is NonNullable<typeof market> => Boolean(market));
  const name = clean(vendor.profile.name);
  const sells = vendorSellsLine(vendor.profile.products, vendor.profile.items, 6);
  const cover = vendor.profile.photos[0];
  const rendered = usToday();

  return (
    <div className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-10 dark:from-green-900/20 dark:to-zinc-950">
      <div className={`${SITE_FRAME} mx-auto flex max-w-xl flex-col gap-5`}>
        <header className="flex items-center gap-4">
          {cover ? (
            <Image
              src={cover.url}
              alt=""
              width={80}
              height={80}
              sizes="80px"
              priority
              className="size-20 shrink-0 rounded-2xl bg-zinc-100 object-cover dark:bg-zinc-800"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight break-words text-zinc-900 sm:text-3xl dark:text-zinc-50">{name}</h1>
            {sells ? <p className="mt-1 text-base text-zinc-600 dark:text-zinc-400">{sells}</p> : null}
          </div>
        </header>

        {listed.some((market) => market.offerings.length > 0) ? (
          <div className="flex flex-col gap-3">
            {listed.map((market) =>
              market.offerings.length ? (
                <VendorOfferingBlock
                  key={market.slug}
                  offerings={market.offerings}
                  rendered={rendered}
                  label={listed.length > 1 ? market.name : undefined}
                  className="mt-0"
                />
              ) : null,
            )}
          </div>
        ) : null}

        <FollowVendorCard slug={vendor.slug} name={name} signedIn={state.signedIn} following={state.following} own={state.own} />

        {listed.length > 0 ? (
          <section aria-labelledby="scan-markets" className="flex flex-col gap-2">
            <h2 id="scan-markets" className="text-base font-semibold tracking-tight">
              Find them at
            </h2>
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {listed.map((market) => (
                <li key={market.slug} className="relative p-3">
                  <Link href={`/markets/${market.slug}`} className="font-medium text-zinc-900 after:absolute after:inset-0 hover:underline dark:text-zinc-100">
                    {market.name}
                  </Link>
                  {market.place ? (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                      {market.place}
                    </p>
                  ) : null}
                  {market.when ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{market.when}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Link
          href={`/vendors/${vendor.slug}`}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-green-700 hover:underline dark:text-green-400"
        >
          More about {name}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  );
}
