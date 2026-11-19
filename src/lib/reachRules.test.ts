import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SCANS_PER_VISITOR_HOUR,
  REPEAT_SCAN_MS,
  countFollowers,
  dailySeries,
  followRefusal,
  isLikelyBot,
  isPrefetch,
  scanDecision,
  type Footprint,
} from './reachRules.ts';
import { visitorHash } from './visitorHash.ts';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const NOW = new Date('2026-11-21T17:00:00Z');

test('one scan from a phone counts', () => {
  assert.equal(scanDecision({ bot: isLikelyBot(IPHONE), lastFromVisitor: null, visitorScansLastHour: 0, now: NOW }), 'count');
});

test('a refresh or second scan within 30 minutes does not count again', () => {
  const justNow = new Date(NOW.getTime() - 60_000);
  assert.equal(scanDecision({ bot: false, lastFromVisitor: justNow, visitorScansLastHour: 1, now: NOW }), 'repeat');
  const later = new Date(NOW.getTime() - REPEAT_SCAN_MS - 1);
  assert.equal(scanDecision({ bot: false, lastFromVisitor: later, visitorScansLastHour: 1, now: NOW }), 'count');
});

test('bots, previews and floods are not counted', () => {
  for (const agent of [
    '',
    'curl/8.4.0',
    'facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    'WhatsApp/2.23.20.0',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
    'Lightpanda/1.0',
    'python-requests/2.31',
  ]) {
    assert.ok(isLikelyBot(agent), agent);
  }
  assert.ok(!isLikelyBot(IPHONE));
  assert.equal(scanDecision({ bot: true, lastFromVisitor: null, visitorScansLastHour: 0, now: NOW }), 'bot');
  assert.equal(scanDecision({ bot: false, lastFromVisitor: null, visitorScansLastHour: MAX_SCANS_PER_VISITOR_HOUR, now: NOW }), 'flood');
  assert.ok(isPrefetch(new Headers({ 'sec-purpose': 'prefetch;prerender' })));
  assert.ok(isPrefetch(new Headers({ 'next-router-prefetch': '1' })));
  assert.ok(!isPrefetch(new Headers({ 'user-agent': IPHONE })));
});

test('the visitor hash hides the address and changes every day', () => {
  const base = { ip: '203.0.113.7', userAgent: IPHONE, day: '2026-11-21', secret: 's3cret' };
  const hash = visitorHash(base);
  assert.equal(hash, visitorHash(base), 'stable within a day');
  assert.ok(!hash.includes('203.0.113.7'));
  assert.notEqual(hash, visitorHash({ ...base, day: '2026-11-22' }));
  assert.notEqual(hash, visitorHash({ ...base, ip: '203.0.113.8' }));
  assert.notEqual(hash, visitorHash({ ...base, secret: 'other' }));
});

test('a duplicate follow does not add a follower', () => {
  assert.equal(countFollowers([{ followerKey: 'user-a' }, { followerKey: 'user-a' }, { followerKey: 'user-b' }]), 2);
  assert.equal(countFollowers([]), 0);
});

test('who may follow', () => {
  assert.equal(followRefusal({ vendorPublic: true, ownVendor: false, emailVerified: true }), null);
  assert.ok(followRefusal({ vendorPublic: false, ownVendor: false, emailVerified: true }));
  assert.ok(followRefusal({ vendorPublic: true, ownVendor: true, emailVerified: true }));
  assert.ok(followRefusal({ vendorPublic: true, ownVendor: false, emailVerified: false }));
});

test('the Footprint is counts only: no emails, names or ids anywhere', () => {
  const footprint: Footprint = {
    totals: { scans: 3, follows: 1, scans30: 3, follows30: 1 },
    hours: [{ hour: '2026-11-21T17:00:00.000Z', scans: 3, follows: 1 }],
  };
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, inner] of Object.entries(value)) {
      if (!Array.isArray(value)) keys.add(key);
      walk(inner);
    }
  };
  walk(footprint);
  assert.deepEqual([...keys].sort(), ['follows', 'follows30', 'hour', 'hours', 'scans', 'scans30', 'totals']);
  assert.ok(!JSON.stringify(footprint).includes('@'));
});

test('the daily series fills every day and buckets hours by local day', () => {
  const hours = [
    { hour: '2026-11-21T17:00:00.000Z', scans: 2, follows: 1 },
    { hour: '2026-11-21T18:00:00.000Z', scans: 1, follows: 0 },
    // 2am UTC on the 22nd is still the 21st on the West Coast.
    { hour: '2026-11-22T02:00:00.000Z', scans: 4, follows: 0 },
    { hour: '2026-10-01T12:00:00.000Z', scans: 9, follows: 9 },
  ];
  const utc = dailySeries(hours, '2026-11-22', (iso) => iso.slice(0, 10), 30);
  assert.equal(utc.length, 30);
  assert.equal(utc[0].day, '2026-10-24');
  assert.deepEqual(utc.slice(-2), [
    { day: '2026-11-21', scans: 3, follows: 1 },
    { day: '2026-11-22', scans: 4, follows: 0 },
  ]);
  const pacific = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(iso));
  const west = dailySeries(hours, '2026-11-22', pacific, 30);
  assert.deepEqual(west.slice(-2), [
    { day: '2026-11-21', scans: 7, follows: 1 },
    { day: '2026-11-22', scans: 0, follows: 0 },
  ]);
});
