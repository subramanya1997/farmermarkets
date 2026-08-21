import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_INDEXNOW_KEY,
  MAX_URLS_PER_REQUEST,
  buildPayloads,
  describeStatus,
  indexNowHost,
  indexNowKey,
  keyLocation,
  normalizeUrls,
  submitUrls
} from './lib/indexnow.mjs';
import { parseArguments } from './indexnow-ping.mjs';

const SITE = 'https://www.farmermarkets.app';

/** A fetch double: records the calls and answers with the queued statuses. */
function fakeFetch(statuses) {
  const calls = [];
  const queue = [...statuses];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      const status = queue.shift() ?? 200;
      if (status instanceof Error) throw status;
      return { status, ok: status >= 200 && status < 300 };
    }
  };
}

const silent = { log: () => {}, warn: () => {} };

test('the committed key matches the served key file name', async () => {
  const { promises: fs } = await import('node:fs');
  const contents = await fs.readFile(new URL(`../public/${DEFAULT_INDEXNOW_KEY}.txt`, import.meta.url), 'utf8');
  assert.equal(contents, DEFAULT_INDEXNOW_KEY);
  assert.match(DEFAULT_INDEXNOW_KEY, /^[0-9a-f]{32}$/);
});

test('the key can be rotated through INDEXNOW_KEY without a code change', () => {
  assert.equal(indexNowKey({}), DEFAULT_INDEXNOW_KEY);
  assert.equal(indexNowKey({ INDEXNOW_KEY: '  ' }), DEFAULT_INDEXNOW_KEY);
  assert.equal(indexNowKey({ INDEXNOW_KEY: 'abc123' }), 'abc123');
});

test('host is bare and keyLocation points at the root key file', () => {
  assert.equal(indexNowHost(SITE), 'www.farmermarkets.app');
  assert.equal(keyLocation(SITE, 'abc123'), 'https://www.farmermarkets.app/abc123.txt');
});

test('normalizeUrls resolves relative paths, de-duplicates, and drops off-host URLs', () => {
  const urls = normalizeUrls(
    [
      '/markets/test',
      'https://www.farmermarkets.app/markets/test',
      '  https://www.farmermarkets.app/about  ',
      'https://example.com/markets/other',
      '',
      'not a url'
    ],
    SITE
  );
  assert.deepEqual(urls, [
    'https://www.farmermarkets.app/markets/test',
    'https://www.farmermarkets.app/about'
  ]);
});

test('payload carries host, key, keyLocation, and urlList', () => {
  const [payload] = buildPayloads(['/markets/test'], { siteUrl: SITE, key: 'abc123' });
  assert.deepEqual(payload, {
    host: 'www.farmermarkets.app',
    key: 'abc123',
    keyLocation: 'https://www.farmermarkets.app/abc123.txt',
    urlList: ['https://www.farmermarkets.app/markets/test']
  });
  assert.deepEqual(Object.keys(payload), ['host', 'key', 'keyLocation', 'urlList']);
});

test('URLs are batched at 10,000 per request', () => {
  const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 3 }, (_unused, index) => `/markets/m-${index}`);
  const payloads = buildPayloads(urls, { siteUrl: SITE, key: 'abc123' });
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].urlList.length, MAX_URLS_PER_REQUEST);
  assert.equal(payloads[1].urlList.length, 3);
  assert.equal(payloads[1].urlList[0], 'https://www.farmermarkets.app/markets/m-10000');
});

test('a batched submission POSTs one request per batch', async () => {
  const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 1 }, (_unused, index) => `/markets/m-${index}`);
  const { calls, fetch } = fakeFetch([200, 202]);
  const result = await submitUrls(urls, { siteUrl: SITE, key: 'abc123', env: {}, fetch, ...silent });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.indexnow.org/indexnow');
  assert.equal(calls[0].init.method, 'POST');
  assert.match(calls[0].init.headers['Content-Type'], /application\/json/);
  assert.equal(calls[0].body.key, 'abc123');
  assert.equal(result.batches, 2);
  assert.equal(result.submitted, MAX_URLS_PER_REQUEST + 1);
  assert.deepEqual(result.results.map((entry) => entry.status), [200, 202]);
  assert.deepEqual(result.results.map((entry) => entry.ok), [true, true]);
});

test('dry run prints the payload and sends nothing', async () => {
  const lines = [];
  const { calls, fetch } = fakeFetch([200]);
  const result = await submitUrls(['/markets/test'], {
    siteUrl: SITE,
    key: 'abc123',
    env: {},
    fetch,
    log: (line) => lines.push(line),
    warn: () => {},
    dryRun: true
  });

  assert.equal(calls.length, 0);
  assert.equal(result.dryRun, true);
  assert.equal(result.batches, 1);
  const payload = JSON.parse(lines[0]);
  assert.deepEqual(payload.urlList, ['https://www.farmermarkets.app/markets/test']);
  assert.equal(payload.keyLocation, 'https://www.farmermarkets.app/abc123.txt');
});

test('INDEXNOW_DISABLE=1 skips the network, --force overrides it', async () => {
  const disabled = fakeFetch([200]);
  const skipped = await submitUrls(['/markets/test'], {
    siteUrl: SITE,
    env: { INDEXNOW_DISABLE: '1' },
    fetch: disabled.fetch,
    ...silent
  });
  assert.equal(disabled.calls.length, 0);
  assert.equal(skipped.skipped, true);

  const forced = fakeFetch([200]);
  await submitUrls(['/markets/test'], {
    siteUrl: SITE,
    env: { INDEXNOW_DISABLE: '1' },
    force: true,
    fetch: forced.fetch,
    ...silent
  });
  assert.equal(forced.calls.length, 1);
});

test('documented status codes map to explanations', () => {
  assert.deepEqual(describeStatus(200), { ok: true, message: 'OK — URLs submitted' });
  assert.equal(describeStatus(202).ok, true);
  assert.match(describeStatus(202).message, /pending validation/);
  assert.equal(describeStatus(400).ok, false);
  assert.match(describeStatus(400).message, /Bad request/);
  assert.match(describeStatus(403).message, /key file missing/);
  assert.match(describeStatus(422).message, /do not belong to the host/);
  assert.match(describeStatus(429).message, /rate limited/);
  assert.equal(describeStatus(500).ok, false);
});

test('a failing batch is reported, not thrown', async () => {
  const warnings = [];
  const { fetch } = fakeFetch([403, new Error('socket hang up')]);
  const urls = Array.from({ length: MAX_URLS_PER_REQUEST + 1 }, (_unused, index) => `/markets/m-${index}`);
  const result = await submitUrls(urls, {
    siteUrl: SITE,
    env: {},
    fetch,
    log: () => {},
    warn: (line) => warnings.push(line)
  });

  assert.deepEqual(result.results.map((entry) => entry.ok), [false, false]);
  assert.equal(result.results[0].status, 403);
  assert.equal(result.results[1].status, 0);
  assert.equal(warnings.length, 2);
  assert.match(warnings[1], /socket hang up/);
});

test('an empty URL list is a no-op', async () => {
  const { calls, fetch } = fakeFetch([200]);
  const result = await submitUrls([], { siteUrl: SITE, env: {}, fetch, ...silent });
  assert.equal(calls.length, 0);
  assert.equal(result.submitted, 0);
  assert.equal(result.skipped, true);
});

test('CLI flags and URL arguments parse', () => {
  assert.deepEqual(parseArguments(['--dry-run', 'https://www.farmermarkets.app/a', '/b']), {
    dryRun: true,
    force: false,
    help: false,
    urls: ['https://www.farmermarkets.app/a', '/b']
  });
  assert.equal(parseArguments(['--force']).force, true);
  assert.equal(parseArguments(['-h']).help, true);
  assert.throws(() => parseArguments(['--nope']), /Unknown argument/);
});
