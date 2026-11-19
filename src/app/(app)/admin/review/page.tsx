import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Inbox } from 'lucide-react';
import { getMarketsByIds, requireAdmin, type reviewQueue } from '@/lib/organizer';
import { LISTING_SECTIONS, SECTION_LABELS } from '@/lib/listingEdits';
import type { FarmerMarket } from '@/app/api/markets/data';
import { Muted, Panel, TimeAgo } from '@/components/admin/bits';
import { PhotoReviewCard } from '@/components/admin/PhotoReviewCard';
import { LegacyHandledButton } from '@/components/admin/LegacyHandledButton';
import { formatTimestamp, placeLabel, roleLabel, timeAgo } from '@/components/admin/format';
import { cachedReviewQueue, cachedVendorQueue } from '../_lib/queue';
import { describeBotAction } from '@/lib/botActions';
import { BotRequestDecision } from '@/components/admin/BotRequestDecision';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review queue',
  robots: { index: false, follow: false },
};

const DONE_MESSAGES: Record<string, string> = {
  'claim-approved': 'Claim approved. The organizer can now edit the listing.',
  'claim-rejected': 'Claim rejected.',
  'change-published': 'Published. The live page updates within a minute.',
  'change-rejected': 'Update rejected.',
  'vendor-published': 'Vendor profile published. The vendor has been emailed.',
  'vendor-rejected': 'Vendor profile rejected. The vendor has been emailed your note.',
};

type Queue = Awaited<ReturnType<typeof reviewQueue>>;
type VendorQueue = Awaited<ReturnType<typeof cachedVendorQueue>>;

export default async function AdminQueuePage({ searchParams }: { searchParams: Promise<{ done?: string | string[] }> }) {
  await requireAdmin();
  const [{ done }, queue, vendorQueue] = await Promise.all([searchParams, cachedReviewQueue(), cachedVendorQueue()]);
  const notice = typeof done === 'string' ? DONE_MESSAGES[done] : undefined;

  const legacyIds = queue.legacyClaims.map((row) => row.marketId).filter((id): id is string => Boolean(id));
  const legacyMarkets = new Map((await getMarketsByIds(legacyIds)).map((market) => [market.id, market]));

  const counts = [
    { id: 'claims', label: 'Claims', count: queue.claims.length },
    { id: 'updates', label: 'Listing updates', count: queue.changes.length },
    { id: 'photos', label: 'Photos', count: queue.photos.length },
    { id: 'bot', label: 'Bot requests', count: queue.botRequests.length },
    { id: 'older', label: 'Older contact-form claims', count: queue.legacyClaims.length },
    { id: 'vendor-profiles', label: 'Vendor profiles', count: vendorQueue.profiles.length },
    { id: 'vendor-applications', label: 'Vendor applications', count: vendorQueue.applications.length },
  ];
  const waiting = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="sr-only">Review queue</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Oldest first. Approving publishes right away.</p>
        </div>
      </div>

      {notice ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-100"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {notice}
          </span>
          <Link href="/admin/review" className="text-xs underline-offset-2 hover:underline">
            Dismiss
          </Link>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-zinc-200 sm:grid-cols-4 lg:grid-cols-7 dark:bg-zinc-800">
        {counts.map((item) => (
          <a key={item.id} href={`#${item.id}`} className="bg-white px-4 py-3 hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${item.count ? '' : 'text-zinc-400 dark:text-zinc-600'}`}>
              {item.count}
            </dd>
          </a>
        ))}
      </dl>

      {waiting === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-white px-6 py-14 text-center dark:bg-zinc-900">
          <Inbox className="size-8 text-zinc-400" aria-hidden="true" />
          <p className="font-medium">Nothing is waiting for review</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">New claims, listing updates, photos, bot requests and vendor reviews show up here.</p>
        </div>
      ) : (
        <>
          <ClaimsSection queue={queue} />
          <ChangesSection queue={queue} />
          <PhotosSection queue={queue} />
          <BotRequestsSection queue={queue} />
          <LegacySection rows={queue.legacyClaims} markets={legacyMarkets} />
          <VendorProfilesSection queue={vendorQueue} />
          <VendorApplicationsSection queue={vendorQueue} />
        </>
      )}
    </div>
  );
}

function MarketCell({ market, fallbackId }: { market?: FarmerMarket; fallbackId: string }) {
  if (!market) {
    return (
      <div className="min-w-0">
        <div className="font-medium">Unknown market</div>
        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{fallbackId}</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <Link href={`/markets/${market.slug}`} className="block truncate font-medium hover:underline">
        {market.name}
      </Link>
      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{placeLabel(market) || 'No city on file'}</div>
    </div>
  );
}

function PersonCell({ name, email }: { name: string; email: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate">{name || 'No name'}</div>
      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{email}</div>
    </div>
  );
}

function Row({ children, href }: { children: ReactNode; href: string }) {
  return (
    <li className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_auto]">
      {children}
      <Link
        href={href}
        className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-green-700 hover:underline md:justify-self-end dark:text-green-400"
      >
        Review
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">{children}</p>;
}

function ClaimsSection({ queue }: { queue: Queue }) {
  return (
    <Panel id="claims" title={`Claims (${queue.claims.length})`}>
      {queue.claims.length === 0 ? (
        <Empty>No claims waiting.</Empty>
      ) : (
        <ul className="divide-y">
          {queue.claims.map(({ claim, user }) => (
            <Row key={claim.id} href={`/admin/claims/${claim.id}`}>
              <MarketCell market={queue.markets.get(claim.marketId)} fallbackId={claim.marketId} />
              <PersonCell name={user.name} email={user.email} />
              <div className="min-w-0 text-zinc-700 dark:text-zinc-300">
                Role: {roleLabel(claim.role)}
                {claim.evidenceUrl ? <Muted>, proof link</Muted> : null}
              </div>
              <TimeAgo date={claim.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
            </Row>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function sectionsOf(changes: unknown): string[] {
  if (!changes || typeof changes !== 'object') return [];
  return LISTING_SECTIONS.filter((section) => section in changes).map((section) => SECTION_LABELS[section]);
}

function ChangesSection({ queue }: { queue: Queue }) {
  return (
    <Panel id="updates" title={`Listing updates (${queue.changes.length})`}>
      {queue.changes.length === 0 ? (
        <Empty>No listing updates waiting.</Empty>
      ) : (
        <ul className="divide-y">
          {queue.changes.map(({ change, user }) => {
            const sections = sectionsOf(change.changes);
            return (
              <Row key={change.id} href={`/admin/changes/${change.id}`}>
                <MarketCell market={queue.markets.get(change.marketId)} fallbackId={change.marketId} />
                <PersonCell name={user.name} email={user.email} />
                <div className="min-w-0 text-zinc-700 dark:text-zinc-300">{sections.length ? sections.join(', ') : 'No sections'}</div>
                <TimeAgo date={change.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
              </Row>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function PhotosSection({ queue }: { queue: Queue }) {
  return (
    <Panel id="photos" title={`Photos (${queue.photos.length})`}>
      {queue.photos.length === 0 ? (
        <Empty>No photos waiting.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {queue.photos.map((photo) => {
            const market = queue.markets.get(photo.marketId);
            return (
              <PhotoReviewCard
                key={photo.id}
                photo={{
                  id: photo.id,
                  url: photo.blobUrl,
                  alt: photo.alt,
                  caption: photo.caption,
                  uploaded: timeAgo(photo.createdAt),
                  uploadedTitle: formatTimestamp(photo.createdAt),
                  uploader: queue.photoUploaders.get(photo.id) ?? null,
                }}
                market={market ? { name: market.name, place: placeLabel(market), slug: market.slug } : null}
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function BotRequestsSection({ queue }: { queue: Queue }) {
  return (
    <Panel id="bot" title={`Bot requests (${queue.botRequests.length})`}>
      <p className="border-b px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        The outreach bot publishes edits and photos itself. Removals and closures wait for you.
      </p>
      {queue.botRequests.length === 0 ? (
        <Empty>No bot requests waiting.</Empty>
      ) : (
        <ul className="divide-y">
          {queue.botRequests.map((row) => {
            const { title, detail, approveLabel } = describeBotAction(row);
            return (
              <li
                key={row.id}
                className="grid items-start gap-x-4 gap-y-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_6.5rem_auto]"
              >
                <MarketCell market={queue.markets.get(row.marketId)} fallbackId={row.marketId} />
                <div className="min-w-0 space-y-1">
                  <div className="font-medium">
                    {title}
                    {detail ? <Muted> · {detail}</Muted> : null}
                  </div>
                  <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{row.note}</p>
                  {row.operatorEmail ? <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">From {row.operatorEmail}</p> : null}
                </div>
                <TimeAgo date={row.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
                <BotRequestDecision id={row.id} approveLabel={approveLabel} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function payloadText(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function LegacySection({ rows, markets }: { rows: Queue['legacyClaims']; markets: Map<string, FarmerMarket> }) {
  return (
    <Panel id="older" title={`Older contact-form claims (${rows.length})`}>
      <p className="border-b px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        Sent through the contact form before accounts existed. Reply by email, then mark each one handled.
      </p>
      {rows.length === 0 ? (
        <Empty>No older requests.</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => {
            const name = payloadText(row.payload, 'name');
            const message = payloadText(row.payload, 'message');
            const source = payloadText(row.payload, 'source');
            const payloadSlug = payloadText(row.payload, 'market_slug');
            const market = row.marketId ? markets.get(row.marketId) : undefined;
            const slug = market?.slug ?? (payloadSlug && /^[a-z0-9-]{1,200}$/.test(payloadSlug) ? payloadSlug : undefined);
            return (
              <li key={row.id} className="grid gap-x-4 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_6.5rem_auto]">
                <div className="min-w-0">
                  <div className="truncate">{name ?? 'No name'}</div>
                  {row.email ? (
                    <a href={`mailto:${row.email}`} className="block truncate text-xs text-green-700 underline-offset-2 hover:underline dark:text-green-400">
                      {row.email}
                    </a>
                  ) : (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">No email</div>
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  {slug ? (
                    <Link href={`/markets/${slug}`} className="font-medium hover:underline">
                      {market?.name ?? slug}
                    </Link>
                  ) : (
                    <div className="text-zinc-500 dark:text-zinc-400">No market named</div>
                  )}
                  {market && placeLabel(market) ? <Muted> {placeLabel(market)}</Muted> : null}
                  {message ? <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{message}</p> : null}
                  {source ? <p className="text-xs text-zinc-500 dark:text-zinc-400">From {source}</p> : null}
                </div>
                <TimeAgo date={row.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
                <LegacyHandledButton id={row.id} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function VendorProfilesSection({ queue }: { queue: VendorQueue }) {
  return (
    <Panel id="vendor-profiles" title={`Vendor profiles (${queue.profiles.length})`}>
      {queue.profiles.length === 0 ? (
        <Empty>No vendor profiles waiting.</Empty>
      ) : (
        <ul className="divide-y">
          {queue.profiles.map((profile) => (
            <li
              key={profile.id}
              className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_6rem_6.5rem_auto]"
            >
              <div className="min-w-0 truncate font-medium">{profile.name}</div>
              <div className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{profile.email}</div>
              <div className="text-zinc-700 dark:text-zinc-300">{profile.firstTime ? 'New vendor' : 'Update'}</div>
              {profile.submittedAt ? (
                <TimeAgo date={profile.submittedAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Unknown</span>
              )}
              <ReviewLink href={`/admin/vendors/${profile.id}`} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function VendorApplicationsSection({ queue }: { queue: VendorQueue }) {
  return (
    <Panel id="vendor-applications" title={`Vendor applications (${queue.applications.length})`}>
      <p className="border-b px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        These markets have no organizer on the site, so the decision is yours.
      </p>
      {queue.applications.length === 0 ? (
        <Empty>No vendor applications waiting.</Empty>
      ) : (
        <ul className="divide-y">
          {queue.applications.map((application) => (
            <li
              key={application.id}
              className="grid items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_6.5rem_auto]"
            >
              <div className="min-w-0 truncate font-medium">{application.vendorName || 'No name yet'}</div>
              <div className="min-w-0">
                {application.market ? (
                  <Link href={`/markets/${application.market.slug}`} className="block truncate hover:underline">
                    {application.market.name}
                  </Link>
                ) : (
                  <span className="text-zinc-500 dark:text-zinc-400">Unknown market</span>
                )}
              </div>
              <TimeAgo date={application.createdAt} className="text-xs text-zinc-500 dark:text-zinc-400" />
              <ReviewLink href={`/admin/vendors/${application.vendorId}`} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ReviewLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 justify-self-start text-sm font-medium text-green-700 hover:underline md:min-h-0 md:justify-self-end dark:text-green-400"
    >
      Review
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
