import { formatDate } from '@/lib/marketFacts';
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

/**
 * The footer line: who published this record, and when it was last touched.
 *
 * Both dates are the data's own. "Last verified" is the record's
 * `last_updated` field — for much of the USDA export that is 2020, and saying
 * so is the honest answer; printing today's date would be the fake-freshness
 * signal this page is being cleaned up to remove. If the record carries
 * neither a publisher nor a date, nothing renders.
 */
export function MarketSourceNote({ provenance, lastUpdated, enrichment, audit }: MarketSourceNoteProps) {
  const verified = formatDate(lastUpdated);
  const retrieved = formatDate(provenance?.retrievedAt);
  const independentlyVerified = formatDate(enrichment?.verified_at);
  const auditDate = formatDate(audit?.checked_at);
  if (!provenance && !verified && !enrichment && !audit) return null;

  const datasetLabel = [provenance?.publisher, provenance?.datasetName]
    .filter(Boolean)
    .join(', ');

  return (
    <footer className="mt-6 max-w-3xl space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 sm:mt-8 dark:border-zinc-700 dark:text-zinc-400">
      {provenance && (
        <p>
          Source:{' '}
          {provenance.catalogUrl ? (
            <a
              href={provenance.catalogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-green-700 dark:hover:text-green-500"
            >
              {datasetLabel}
            </a>
          ) : (
            datasetLabel
          )}
          {retrieved && `, retrieved ${retrieved}`}
          {provenance.license && ` · ${provenance.license}`}
        </p>
      )}
      {verified && <p>Last verified in the source data: {verified}.</p>}
      {enrichment && (
        <p>
          Additional details checked
          {independentlyVerified ? ` ${independentlyVerified}` : ''} against{' '}
          {enrichment.sources.map((source, index) => (
            <span key={`${source.url}-${index}`}>
              {index > 0 && (index === enrichment.sources.length - 1 ? ' and ' : ', ')}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-700 dark:hover:text-green-500"
              >
                {source.title}
              </a>
            </span>
          ))}
          .
        </p>
      )}
      {audit?.status === 'official_source_reviewed' && (
        <p>Official publisher catalog or source reviewed{auditDate ? ` ${auditDate}` : ''}.</p>
      )}
      {audit?.status === 'checked_no_verified_update' && (
        <p>
          Current listing checked{auditDate ? ` ${auditDate}` : ''}; no additional public details
          were confirmed.
        </p>
      )}
      {audit?.status === 'identity_ambiguous' && (
        <p className="text-amber-700 dark:text-amber-400">
          A current listing could not be confidently matched{auditDate ? ` on ${auditDate}` : ''}.
          Verify the location and schedule before traveling.
        </p>
      )}
      {audit?.status === 'blocked' && (
        <p className="text-amber-700 dark:text-amber-400">
          The current-details check could not be completed{auditDate ? ` on ${auditDate}` : ''}.
          Verify details before traveling.
        </p>
      )}
    </footer>
  );
}
