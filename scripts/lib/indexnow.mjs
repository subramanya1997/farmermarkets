/**
 * IndexNow: the one place the key, the payload shape, and the HTTP contract live.
 *
 * IndexNow is a push protocol — we tell participating engines which URLs
 * changed instead of waiting to be crawled. It is consumed by Bing, Yandex,
 * Naver, Seznam and Yep (Google does **not** consume it). A submission is
 * authenticated by hosting a text file at the site root whose name is the key
 * and whose body is the key.
 *
 * ## The key
 *
 * `DEFAULT_INDEXNOW_KEY` and the committed file
 * `public/<key>.txt` are two halves of one fact, so they must be rotated
 * together:
 *
 *   1. generate a new key: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`
 *   2. `git mv public/<old>.txt public/<new>.txt` and write the new key into it
 *      (no trailing newline — the file body must be exactly the key)
 *   3. update `DEFAULT_INDEXNOW_KEY` below to match the filename
 *   4. deploy **before** the next ping, so the key file is live when an engine
 *      fetches `keyLocation` to verify the submission
 *
 * For an emergency rotation without a code change, set the `INDEXNOW_KEY`
 * environment variable *and* upload the matching `<key>.txt` to the site root;
 * the env value wins over the constant. A key that is valid but not yet
 * verified answers 202 rather than 200 — that is expected, not an error.
 */

/**
 * The committed key. MUST equal the basename of the file in `public/`.
 * See the rotation steps above before changing it.
 */
export const DEFAULT_INDEXNOW_KEY = 'f2a3b61ce1ab35eb413e148b37de3f80';

/** IndexNow accepts at most 10,000 URLs in one POST. */
export const MAX_URLS_PER_REQUEST = 10_000;

/** The generic endpoint; it forwards submissions to every participating engine. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/**
 * Canonical origin, mirroring `src/lib/site.ts`. Duplicated rather than
 * imported because this module is plain ESM run by `node` with no TS loader.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.farmermarkets.app';

/** The key actually used at runtime: env override first, committed key second. */
export function indexNowKey(env = process.env) {
  const override = String(env.INDEXNOW_KEY ?? '').trim();
  return override || DEFAULT_INDEXNOW_KEY;
}

/** Host as IndexNow wants it: bare hostname, no scheme, no trailing slash. */
export function indexNowHost(siteUrl = SITE_URL) {
  return new URL(siteUrl).host;
}

/** Absolute URL of the key file, which engines fetch to verify a submission. */
export function keyLocation(siteUrl = SITE_URL, key = indexNowKey()) {
  return new URL(`/${key}.txt`, siteUrl).toString();
}

/** True when pings are switched off (CI, tests, local runs). */
export function indexNowDisabled(env = process.env) {
  return ['1', 'true', 'yes'].includes(String(env.INDEXNOW_DISABLE ?? '').trim().toLowerCase());
}

/** Trimmed, de-duplicated, same-host absolute URLs, in first-seen order. */
export function normalizeUrls(urls, siteUrl = SITE_URL) {
  const host = indexNowHost(siteUrl);
  const seen = new Set();
  const kept = [];
  for (const raw of urls ?? []) {
    const value = String(raw ?? '').trim();
    // Only an absolute http(s) URL or a root-relative path; anything else
    // ("not a url", "mailto:…") would otherwise be resolved into a bogus
    // same-host URL by the URL constructor.
    if (!value) continue;
    if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) continue;
    let absolute;
    try {
      absolute = new URL(value, siteUrl).toString();
    } catch {
      continue;
    }
    // IndexNow answers 422 when a submitted URL is not on the declared host,
    // and one stray URL rejects the whole batch — so drop them here.
    if (new URL(absolute).host !== host) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    kept.push(absolute);
  }
  return kept;
}

/**
 * Split URLs into the JSON bodies that will be POSTed, at most
 * `MAX_URLS_PER_REQUEST` URLs each.
 */
export function buildPayloads(urls, options = {}) {
  const siteUrl = options.siteUrl ?? SITE_URL;
  const key = options.key ?? indexNowKey();
  const normalized = options.skipNormalize ? [...urls] : normalizeUrls(urls, siteUrl);
  const payloads = [];

  for (let index = 0; index < normalized.length; index += MAX_URLS_PER_REQUEST) {
    payloads.push({
      host: indexNowHost(siteUrl),
      key,
      keyLocation: keyLocation(siteUrl, key),
      urlList: normalized.slice(index, index + MAX_URLS_PER_REQUEST)
    });
  }
  return payloads;
}

/** What each documented IndexNow status code means, and whether it succeeded. */
export function describeStatus(status) {
  switch (status) {
    case 200:
      return { ok: true, message: 'OK — URLs submitted' };
    case 202:
      return { ok: true, message: 'Accepted — URLs received, key still pending validation' };
    case 400:
      return { ok: false, message: 'Bad request — invalid payload format' };
    case 403:
      return { ok: false, message: 'Forbidden — key not valid, or key file missing at keyLocation' };
    case 422:
      return { ok: false, message: 'Unprocessable — URLs do not belong to the host, or the key does not match' };
    case 429:
      return { ok: false, message: 'Too many requests — submissions rate limited as potential spam' };
    default:
      return { ok: status >= 200 && status < 300, message: `Unexpected status ${status}` };
  }
}

/**
 * Submit URLs to IndexNow.
 *
 * Returns `{ submitted, batches, skipped, dryRun, results }` and never throws
 * on a network or HTTP failure — callers (notably the nightly data refresh)
 * treat a failed ping as a warning, not as a failed run.
 */
export async function submitUrls(urls, options = {}) {
  const siteUrl = options.siteUrl ?? SITE_URL;
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const warn = options.warn ?? console.warn;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const endpoint = options.endpoint ?? INDEXNOW_ENDPOINT;
  const key = options.key ?? indexNowKey(env);
  const normalized = normalizeUrls(urls, siteUrl);

  if (normalized.length === 0) {
    log('indexnow: nothing to submit');
    return { submitted: 0, batches: 0, skipped: true, dryRun: Boolean(options.dryRun), results: [] };
  }

  const payloads = buildPayloads(normalized, { siteUrl, key, skipNormalize: true });

  if (options.dryRun) {
    for (const payload of payloads) log(JSON.stringify(payload, null, 2));
    log(`indexnow: dry run — ${normalized.length} URL(s) in ${payloads.length} batch(es), nothing sent`);
    return { submitted: normalized.length, batches: payloads.length, skipped: false, dryRun: true, results: [] };
  }

  if (!options.force && indexNowDisabled(env)) {
    log(`indexnow: disabled by INDEXNOW_DISABLE; skipped ${normalized.length} URL(s)`);
    return { submitted: 0, batches: 0, skipped: true, dryRun: false, results: [] };
  }

  const results = [];
  for (const [index, payload] of payloads.entries()) {
    const label = `batch ${index + 1}/${payloads.length} (${payload.urlList.length} URL(s))`;
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': 'farmermarkets.app indexnow-ping/1.0'
        },
        body: JSON.stringify(payload)
      });
      const description = describeStatus(response.status);
      results.push({ status: response.status, ok: description.ok, message: description.message, urlCount: payload.urlList.length });
      const line = `indexnow: ${label} → ${response.status} ${description.message}`;
      if (description.ok) log(line);
      else warn(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ status: 0, ok: false, message, urlCount: payload.urlList.length });
      warn(`indexnow: ${label} → request failed: ${message}`);
    }
  }

  return {
    submitted: normalized.length,
    batches: payloads.length,
    skipped: false,
    dryRun: false,
    results
  };
}

/**
 * Fire-and-forget wrapper for callers that must not fail because of a ping —
 * the nightly refresh uses this. Every error is logged as a warning and
 * swallowed.
 */
export async function pingIndexNow(urls, options = {}) {
  try {
    return await submitUrls(urls, options);
  } catch (error) {
    const warn = options.warn ?? console.warn;
    warn(`indexnow: ping failed: ${error instanceof Error ? error.message : String(error)}`);
    return { submitted: 0, batches: 0, skipped: true, dryRun: false, results: [], error: true };
  }
}
