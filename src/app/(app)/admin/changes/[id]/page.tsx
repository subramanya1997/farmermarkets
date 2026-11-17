import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getChangeForReview, requireAdmin } from '@/lib/organizer';
import { SECTION_LABELS, changedSections } from '@/lib/listingEdits';
import { DecisionForm } from '@/components/admin/DecisionForm';
import { SectionDiff } from '@/components/admin/SectionDiff';
import { Fact, Facts, Muted, Panel, StatusPill, TimeAgo } from '@/components/admin/bits';
import { placeLabel } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review listing update',
  robots: { index: false, follow: false },
};

export default async function ChangeReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const review = await getChangeForReview(id);
  if (!review) notFound();

  const { change, user, market, published, proposed } = review;
  const sections = changedSections(proposed);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="space-y-1">
        <Link href="/admin/review" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Review queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Listing update for {market?.name ?? 'an unknown market'}</h1>
          <StatusPill status={change.status} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          From {user.name || 'No name'} ({user.email}) · submitted <TimeAgo date={change.createdAt} />
          {market && placeLabel(market) ? <> · {placeLabel(market)}</> : null}
        </p>
        {market ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href={`/markets/${market.slug}`} className="text-green-700 hover:underline dark:text-green-400">
              Public page
            </Link>
            <Link href={`/admin/markets/${market.slug}`} className="text-green-700 hover:underline dark:text-green-400">
              Market admin
            </Link>
          </p>
        ) : null}
      </div>

      {!market ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          Market {change.marketId} is no longer in the dataset, so this update cannot be published. You can still reject it.
        </p>
      ) : null}

      {sections.length === 0 ? (
        <Panel title="Changes">
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            This update has no readable changes. It may have been saved in an older format.
          </p>
        </Panel>
      ) : (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Changes {sections.length === 1 ? 'one section' : `${sections.length} sections`}:{' '}
            {sections.map((section) => SECTION_LABELS[section]).join(', ')}. Compared with the live listing now.
          </p>
          <div className="space-y-4">
            {sections.map((section) => (
              <SectionDiff key={section} section={section} before={published} after={proposed} />
            ))}
          </div>
        </>
      )}

      {change.status === 'pending' ? (
        market ? (
          <DecisionForm
            kind="change"
            id={change.id}
            approveLabel="Approve and publish"
            approveHint="Publishing updates the live page within a minute."
          />
        ) : (
          <DecisionForm kind="change" id={change.id} rejectOnly />
        )
      ) : (
        <Panel title="Decision">
          <Facts>
            <Fact label="Result">
              <StatusPill status={change.status} />
            </Fact>
            {change.reviewedAt ? (
              <Fact label="Reviewed">
                <TimeAgo date={change.reviewedAt} />
              </Fact>
            ) : null}
            <Fact label="Note sent">{change.reviewNote || <Muted>None</Muted>}</Fact>
          </Facts>
        </Panel>
      )}
    </div>
  );
}
