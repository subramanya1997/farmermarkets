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
    country: options.country || 'All countries',
    data_ready: true,
    sensitive_value_redacted: query === '[redacted]',
  };
}
