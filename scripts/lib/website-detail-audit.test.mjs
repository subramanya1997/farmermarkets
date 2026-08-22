import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalSocialProfile,
  contactArtifacts,
  detailLinkScore,
  selectDetailLinks,
} from './website-detail-audit.mjs';

test('canonical social profiles reject posts, events, and generic navigation', () => {
  assert.equal(canonicalSocialProfile('https://www.instagram.com/kentonmarket/'), 'https://instagram.com/kentonmarket');
  assert.equal(canonicalSocialProfile('https://instagram.com/stories/kentonmarket/123'), undefined);
  assert.equal(canonicalSocialProfile('https://facebook.com/events/123'), undefined);
  assert.equal(canonicalSocialProfile('https://youtube.com/watch?v=123'), undefined);
});

test('detail links stay on site and prioritize visitor information', () => {
  const base = 'https://market.example/markets/saturday';
  assert.ok(detailLinkScore({ text: 'Visitor FAQ', href: '/faq' }, base) > detailLinkScore({ text: 'Vendors', href: '/vendors' }, base));
  assert.equal(detailLinkScore({ text: 'FAQ', href: 'https://other.example/faq' }, base), 0);
  assert.equal(detailLinkScore({ text: 'Become a vendor', href: '/apply' }, base), 0);
  const selected = selectDetailLinks([
    { text: 'Vendors', href: 'https://market.example/vendors' },
    { text: 'Visitor FAQ', href: 'https://market.example/faq' },
    { text: 'FAQ duplicate', href: 'https://market.example/faq#top' },
  ], base, 2);
  assert.deepEqual(selected.map((link) => link.href), [
    'https://market.example/faq',
    'https://market.example/vendors',
  ]);
});

test('contact artifacts retain only canonical socials and explicit newsletters', () => {
  const artifacts = contactArtifacts([
    { text: 'Instagram', href: 'https://instagram.com/ourmarket/' },
    { text: 'Latest post', href: 'https://instagram.com/p/abc' },
    { text: 'Subscribe to our newsletter', href: 'https://market.example/newsletter' },
  ]);
  assert.deepEqual(artifacts.social_profiles, ['https://instagram.com/ourmarket']);
  assert.deepEqual(artifacts.newsletter_urls, ['https://market.example/newsletter']);
  assert.deepEqual(selectDetailLinks('malformed', 'https://market.example/', 2), []);
  assert.deepEqual(contactArtifacts('malformed').social_profiles, []);
});
