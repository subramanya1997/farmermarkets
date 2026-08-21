import { formatDate } from '@/lib/marketFacts';
import type { MarketProvenance } from '@/lib/provenance';

interface MarketSourceNoteProps {
  /** `null` for the legacy records, which name no publisher. */
  provenance: MarketProvenance | null;
  /** The record's own `last_updated` stamp. */
  lastUpdated?: string | null;
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
export function MarketSourceNote({ provenance, lastUpdated }: MarketSourceNoteProps) {
  const verified = formatDate(lastUpdated);
  const retrieved = formatDate(provenance?.retrievedAt);
  if (!provenance && !verified) return null;

  const datasetLabel = [provenance?.publisher, provenance?.datasetName]
    .filter(Boolean)
    .join(', ');

  return (
    <footer className="mt-6 space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 sm:mt-8 dark:border-zinc-700 dark:text-zinc-400">
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
    </footer>
  );
}
