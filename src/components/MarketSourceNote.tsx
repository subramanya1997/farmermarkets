import { formatDate } from '@/lib/marketFacts';
import { clean } from '@/lib/geo';
import type { MarketProvenance } from '@/lib/provenance';
import type { MarketAuditMetadata, MarketEnrichmentMetadata } from '@/lib/enrichment';

interface MarketSourceNoteProps {
  /** `null` for the legacy records, which name no publisher. */
  provenance: MarketProvenance | null;
  /** The record's own `last_updated` stamp. */
  lastUpdated?: string | null;
  enrichment?: MarketEnrichmentMetadata;
  audit?: MarketAuditMetadata;
}

function hostOf(url?: string | null): string | undefined {
  try {
    return url ? new URL(url).hostname.replace(/^www\./i, '') : undefined;
  } catch {
    return undefined;
  }
}

function isoDay(value?: string | null): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

const LINK = 'underline hover:text-green-700 dark:hover:text-green-500';

/**
 * The footer: one line saying when the page's facts were last updated and
 * from where, with every source behind a "Sources" fold.
 *
 * All dates are the data's own (never today's), so an old USDA stamp still
 * says so; it is just no longer the headline when researched facts are newer.
 * The "could not be matched" caution only shows when no newer research
 * supersedes that check.
 */
export function MarketSourceNote({ provenance, lastUpdated, enrichment, audit }: MarketSourceNoteProps) {
  if (!provenance && !formatDate(lastUpdated) && !enrichment && !audit) return null;

  const sources = (enrichment?.sources ?? []).filter((source) => hostOf(source.url));
  const researchHost =
    hostOf(sources.find((source) => source.kind === 'first_party')?.url) ?? hostOf(sources[0]?.url);
  const publisher = clean(provenance?.publisher) || undefined;
  const candidates = [
    { day: isoDay(enrichment?.verified_at), from: researchHost },
    { day: isoDay(provenance?.retrievedAt), from: publisher },
    { day: isoDay(lastUpdated), from: publisher },
  ].filter((candidate): candidate is { day: string; from: string | undefined } => Boolean(candidate.day));
  const latest = candidates.sort((left, right) => right.day.localeCompare(left.day))[0];

  const enrichedDay = isoDay(enrichment?.verified_at);
  const auditDay = isoDay(audit?.checked_at);
  const auditDate = formatDate(audit?.checked_at);
  const caution =
    (audit?.status === 'identity_ambiguous' || audit?.status === 'blocked') &&
    !(enrichedDay && auditDay && enrichedDay > auditDay);

  const datasetLabel = [provenance?.publisher, provenance?.datasetName].filter(Boolean).join(', ');
  const retrieved = formatDate(provenance?.retrievedAt);
  const original = formatDate(lastUpdated);

  return (
    <footer className="mt-8 max-w-3xl space-y-2 border-t border-zinc-200 pt-4 text-xs text-zinc-500 sm:mt-10 dark:border-zinc-700 dark:text-zinc-400">
      {caution && (
        <p className="text-amber-700 dark:text-amber-400">
          We could not confirm this listing{auditDate ? ` on ${auditDate}` : ''}. Check details before you go.
        </p>
      )}
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
          {latest ? (
            <>
              Updated {formatDate(latest.day)}
              {latest.from ? ` from ${latest.from}` : ''}
              {' · '}
            </>
          ) : null}
          <span className="underline group-open:no-underline">Sources</span>
        </summary>
        <ul className="mt-2 space-y-1">
          {provenance && (
            <li>
              {provenance.catalogUrl ? (
                <a href={provenance.catalogUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
                  {datasetLabel}
                </a>
              ) : (
                datasetLabel
              )}
              {retrieved && `, retrieved ${retrieved}`}
              {provenance.license && ` · ${provenance.license}`}
            </li>
          )}
          {original && <li>Original listing last updated {original}</li>}
          {sources.map((source, index) => (
            <li key={`${source.url}-${index}`}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className={LINK}>
                {/* Page titles arrive with the publisher's own dashes. */}
                {clean(source.title) || hostOf(source.url)}
              </a>
            </li>
          ))}
          {audit?.status === 'official_source_reviewed' && (
            <li>Official source reviewed{auditDate ? ` ${auditDate}` : ''}</li>
          )}
          {audit?.status === 'checked_no_verified_update' && (
            <li>Rechecked{auditDate ? ` ${auditDate}` : ''}, no changes found</li>
          )}
        </ul>
      </details>
    </footer>
  );
}
