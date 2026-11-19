import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { emailDomainHint, getClaimForReview, managersFor, requireAdmin } from '@/lib/organizer';
import { SECTION_LABELS, changedSections } from '@/lib/listingEdits';
import { DecisionForm } from '@/components/admin/DecisionForm';
import { SectionDiff } from '@/components/admin/SectionDiff';
import { ExternalA, Fact, Facts, Muted, Panel, StatusPill, TimeAgo } from '@/components/admin/bits';
import { placeLabel, roleLabel, safeHttpUrl, shortUrl } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review claim',
  robots: { index: false, follow: false },
};

export default async function ClaimReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const review = await getClaimForReview(id);
  if (!review) notFound();

  const { claim, user, market, change, photos } = review;
  const sections = change ? changedSections(change.proposed) : [];
  const waiting = [
    sections.length ? `${sections.length === 1 ? 'one listing section' : `${sections.length} listing sections`}` : '',
    photos.length ? `${photos.length === 1 ? 'one photo' : `${photos.length} photos`}` : '',
  ].filter(Boolean);
  const managers = await managersFor(claim.marketId);
  const hint = market ? emailDomainHint(user.email, market) : null;
  const hintMatches = hint?.includes(' matches ') ?? false;
  const proof = safeHttpUrl(claim.evidenceUrl);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Claim for {market?.name ?? 'an unknown market'}</h1>
          <StatusPill status={claim.status} />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Submitted <TimeAgo date={claim.createdAt} />
          {market && placeLabel(market) ? <> · {placeLabel(market)}</> : null}
        </p>
      </div>

      <Panel title="Organizer">
        <Facts>
          <Fact label="Name">{user.name || <Muted>No name</Muted>}</Fact>
          <Fact label="Email">
            <a href={`mailto:${user.email}`} className="text-green-700 underline-offset-2 hover:underline dark:text-green-400">
              {user.email}
            </a>
          </Fact>
          <Fact label="Role">{roleLabel(claim.role)}</Fact>
          <Fact label="Phone">{claim.phone || <Muted>Not given</Muted>}</Fact>
          <Fact label="Proof">
            {proof ? (
              <ExternalA href={proof} className="break-all">
                {shortUrl(proof)}
              </ExternalA>
            ) : claim.evidenceUrl ? (
              <span className="break-all">{claim.evidenceUrl}</span>
            ) : (
              <Muted>None</Muted>
            )}
          </Fact>
          <Fact label="Message">
            {claim.message ? <p className="whitespace-pre-line">{claim.message}</p> : <Muted>None</Muted>}
          </Fact>
        </Facts>
        {hint ? (
          <p
            className={`flex items-center gap-2 border-t px-4 py-2.5 text-sm ${
              hintMatches ? 'text-green-800 dark:text-green-300' : 'text-amber-800 dark:text-amber-300'
            }`}
          >
            {hintMatches ? <ShieldCheck className="size-4 shrink-0" aria-hidden="true" /> : <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />}
            {hint}
          </p>
        ) : null}
      </Panel>

      {market ? (
        <Panel
          title="Market on file"
          action={
            <Link href={`/markets/${market.slug}`} className="text-xs text-green-700 hover:underline dark:text-green-400">
              Public page
            </Link>
          }
        >
          <Facts>
            <Fact label="Market">
              <Link href={`/admin/markets/${market.slug}`} className="font-medium hover:underline">
                {market.name}
              </Link>
            </Fact>
            <Fact label="Address">
              {[market.address, placeLabel(market), market.zip_code].filter(Boolean).join(', ') || <Muted>Not on file</Muted>}
            </Fact>
            <Fact label="Websites">
              <LinkList values={market.websites} />
            </Fact>
            <Fact label="Phone">
              {market.phone_numbers?.length ? market.phone_numbers.join(', ') : <Muted>Not on file</Muted>}
            </Fact>
            <Fact label="Emails">
              {market.emails?.length ? (
                <ul>
                  {market.emails.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              ) : (
                <Muted>Not on file</Muted>
              )}
            </Fact>
            <Fact label="Social">
              <LinkList values={market.social_media} />
            </Fact>
          </Facts>
        </Panel>
      ) : (
        <Panel title="Market on file">
          <p className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
            Market {claim.marketId} is no longer in the dataset.
          </p>
        </Panel>
      )}

      <Panel title={`Current managers (${managers.length})`}>
        {managers.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nobody manages this market yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {managers.map((manager) => (
              <li key={manager.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="font-medium">{manager.name || 'No name'}</span> <Muted>{manager.email}</Muted>
                </span>
                <Muted>
                  Since <TimeAgo date={manager.createdAt} />
                </Muted>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {claim.status === 'pending' && change && sections.length ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">What they already changed</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {sections.map((section) => SECTION_LABELS[section]).join(', ')}. Compared with the live listing now. Approving the claim
            publishes this.
          </p>
          {sections.map((section) => (
            <SectionDiff key={section} section={section} before={change.published} after={change.proposed} />
          ))}
        </section>
      ) : null}

      {claim.status === 'pending' && photos.length ? (
        <Panel title={`Photos they uploaded (${photos.length})`}>
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
            {photos.map((photo) => (
              <li key={photo.id}>
                <a
                  href={photo.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-[4/3] overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-800"
                  title="Open full size"
                >
                  <Image src={photo.blobUrl} alt={photo.alt || 'Uploaded photo'} fill sizes="(min-width: 640px) 33vw, 50vw" className="object-cover" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {claim.status === 'pending' ? (
        <DecisionForm
          kind="claim"
          id={claim.id}
          approveHint={
            waiting.length
              ? `Approving also publishes their ${waiting.join(' and ')}. Rejecting turns those down too.`
              : 'The organizer can keep editing, and changes go through normal review after this.'
          }
        />
      ) : (
        <Panel title="Decision">
          <Facts>
            <Fact label="Result">
              <StatusPill status={claim.status} />
            </Fact>
            {claim.reviewedAt ? (
              <Fact label="Reviewed">
                <TimeAgo date={claim.reviewedAt} />
              </Fact>
            ) : null}
            <Fact label="Note sent">{claim.reviewNote || <Muted>None</Muted>}</Fact>
          </Facts>
        </Panel>
      )}
    </div>
  );
}

function LinkList({ values }: { values?: string[] }) {
  const links = (values ?? []).map((value) => ({ value, href: safeHttpUrl(value) }));
  if (links.length === 0) return <Muted>Not on file</Muted>;
  return (
    <ul>
      {links.map(({ value, href }) => (
        <li key={value} className="break-all">
          {href ? <ExternalA href={href}>{shortUrl(value)}</ExternalA> : value}
        </li>
      ))}
    </ul>
  );
}
