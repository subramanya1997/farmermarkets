import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWebsiteAuditCandidate,
  extractEvidenceExcerpts,
  marketIdentityDecision,
  marketRowKey,
  normalizeWebsiteUrl,
  websiteShardForHost,
  websiteTargetId,
} from './website-audit.mjs';

test('website candidates exclude social profiles and Google Maps', () => {
  assert.equal(isWebsiteAuditCandidate('https://example.org/market'), true);
  assert.equal(isWebsiteAuditCandidate('https://facebook.com/example'), false);
  assert.equal(isWebsiteAuditCandidate('https://www.google.com/maps/place/example'), false);
});

test('normalization removes tracking and superficial URL differences', () => {
  assert.equal(
    normalizeWebsiteUrl('HTTPS://Example.org//market/?utm_source=test&b=2&a=1#hours'),
    'https://example.org/market?a=1&b=2'
  );
});

test('row keys preserve duplicate IDs through unique slugs', () => {
  assert.notEqual(
    marketRowKey('legacy', { id: 307414, slug: 'baxter-market-baxter' }),
    marketRowKey('legacy', { id: 307414, slug: 'brimson-market-brimson' })
  );
});

test('target and shard assignment are deterministic', () => {
  assert.equal(websiteTargetId('https://example.org/market'), websiteTargetId('https://example.org/market'));
  assert.equal(websiteShardForHost('example.org'), websiteShardForHost('example.org'));
});

test('identity requires both market name and locality evidence', () => {
  const row = {
    market_name: 'Kenton Farmers Market',
    location: { city: 'Portland', zip_code: '97217' },
  };
  assert.deepEqual(
    marketIdentityDecision(row, {
      title: 'Kenton Farmers Market',
      h1: ['Kenton Farmers Market'],
      main_text: 'Visit us in Portland, Oregon 97217.',
    }),
    { identity_match: true, name_match: true, locality_match: true }
  );
  assert.equal(
    marketIdentityDecision(row, {
      title: 'Kenton Farmers Market',
      h1: ['Kenton Farmers Market'],
      main_text: 'An operator page with no location.',
    }).identity_match,
    false
  );
});

test('evidence extraction keeps bounded visitor-relevant lines', () => {
  const excerpts = extractEvidenceExcerpts([
    'Open Saturdays from 9 am to 1 pm.',
    'Free street parking and bike parking are available.',
    'Dogs are not allowed except service animals.',
    'Q: Can I bring my dog? A: Service animals only.',
  ].join('\n'));
  assert.ok(excerpts.some((entry) => entry.kind === 'schedule'));
  assert.ok(excerpts.some((entry) => entry.kind === 'parking'));
  assert.ok(excerpts.some((entry) => entry.kind === 'pets'));
  assert.ok(excerpts.some((entry) => entry.kind === 'faq'));
  assert.ok(excerpts.every((entry) => entry.excerpt.length <= 500));
});

test('FAQ evidence pairs adjacent visitor questions and answers', () => {
  const excerpts = extractEvidenceExcerpts([
    'Can I bring my dog to the market?',
    'Service animals are welcome, but other pets are not allowed.',
    'How do I become a vendor?',
    'Complete the vendor application.',
  ].join('\n'));
  assert.deepEqual(excerpts.filter((entry) => entry.kind === 'faq').map((entry) => entry.excerpt), [
    'Q: Can I bring my dog to the market? A: Service animals are welcome, but other pets are not allowed.',
  ]);
});
