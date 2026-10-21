export function analyticsSafeSearchTerm(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 80);
  const containsEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized);
  const containsPhoneNumber = normalized.replace(/\D/g, "").length >= 7;
  return containsEmail || containsPhoneNumber ? "[redacted]" : normalized;
}

interface SettledSearchOptions {
  query: string;
  country: string;
  resultCount: number;
  loading: boolean;
  error: string | null;
}

/** Partial and failed downloads cannot describe a successful search's results. */
export function settledMarketSearchEvent(options: SettledSearchOptions) {
  if (options.loading || options.error) return null;
  const query = analyticsSafeSearchTerm(options.query);
  if (query.length < 2) return null;
  return {
    query,
    result_count: options.resultCount,
    // Searches that find nothing are the clearest sign of unmet demand.
    zero_results: options.resultCount === 0,
    search_source: 'market_explorer',
    country: options.country || 'All countries',
    data_ready: true,
    sensitive_value_redacted: query === '[redacted]',
  };
}

/**
 * The city finder on a state page. Same redaction and minimum length as the
 * market search, so the two can be read side by side.
 */
export function citySearchEvent(options: { query: string; resultCount: number; region: string }) {
  const query = analyticsSafeSearchTerm(options.query);
  if (query.length < 2) return null;
  return {
    query,
    result_count: options.resultCount,
    zero_results: options.resultCount === 0,
    search_source: 'state_city_directory',
    region: options.region,
    sensitive_value_redacted: query === '[redacted]',
  };
}
