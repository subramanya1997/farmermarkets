import test from 'node:test';
import assert from 'node:assert/strict';
import { authorityContext, identitySupported, fieldSupported, qualifiedCitations } from './parallel-evidence.mjs';
const market = { name: 'Oak Hill Farmers Market', location: { city: 'Oak Hill' } };
const citation = (url, text) => ({ url, excerpts: [text] });
const basis = (field, text, confidence = 'high', url = 'https://oakhill.test/market') => ({ field, confidence, citations: [citation(url, text)] });
const output = { official_website: 'https://www.oakhill.test/market' };
const entries = [basis('official_website', 'Oak Hill Farmers Market in Oak Hill'), basis('status', 'Oak Hill Farmers Market is open Saturdays in Oak Hill')];
test('operating status needs high-confidence published authority, identity and matching returned host', () => {
  assert.ok(authorityContext(market, output, new Map(entries.map(b => [b.field, b]))));
  for (const bad of [basis('status', 'Oak Hill Farmers Market open in Oak Hill', 'medium'), basis('status', 'Oak Hill Farmers Market open in Oak Hill', 'high', 'https://yelp.com/market'), basis('status', 'Oak Hill Farmers Market permanently closed in Oak Hill'), { field: 'status', confidence: 'high', citations: [] }]) {
    assert.equal(authorityContext(market, output, new Map([['official_website', entries[0]], ['status', bad]])), null);
  }
  assert.equal(authorityContext(market, { official_website: 'https://other-market.test' }, new Map(entries.map(b => [b.field, b]))), null);
  assert.equal(authorityContext({ ...market, location: { city: 'Elsewhere' } }, output, new Map(entries.map(b => [b.field, b]))), null);
});
test('identity cannot be established from model reasoning, headings or unrelated locality', () => {
  assert.equal(identitySupported(market, [{ title: market.name, excerpts: ['A popular market'], url: 'https://oakhill.test' }]), false);
  assert.equal(identitySupported(market, [citation('https://oakhill.test', 'Oak Hill farmers market in Oak Hill')]), true);
  assert.equal(qualifiedCitations({ confidence: 'high', citations: [{ url: 'https://oakhill.test', title: market.name }] }).length, 0);
});
test('phone, schedule and season need their published values, not homepage headings', () => {
  const heading = [citation('https://oakhill.test', 'Oak Hill Farmers Market')];
  assert.equal(fieldSupported('phone', '(555) 123-4567', heading), false);
  assert.equal(fieldSupported('phone', '(555) 123-4567', [citation('https://oakhill.test', 'Call 555-123-4567')]), true);
  assert.equal(fieldSupported('schedule', 'Saturdays 8am-12pm', heading), false);
  const hours = [citation('https://oakhill.test', 'Saturdays 8:00 a.m. to noon, May through October')];
  assert.equal(fieldSupported('schedule', 'Saturdays 8am-12pm', hours), true);
  assert.equal(fieldSupported('schedule', 'Saturdays 9am-12pm', hours), false);
  assert.equal(fieldSupported('season', 'Year-round', hours), false);
  assert.equal(fieldSupported('season', 'Year-round', [citation('https://oakhill.test', 'OPEN ALL YEAR')]), true);
});
test('social URLs must cite matching profile, not another market with same platform', () => {
  assert.equal(fieldSupported('facebook_url', 'https://facebook.com/oakhill', [citation('https://facebook.com/elsewhere', 'Elsewhere market')]), false);
  assert.equal(fieldSupported('facebook_url', 'https://facebook.com/oakhill', [citation('https://www.facebook.com/oakhill/?ref=abc', 'Oak Hill')]), true);
});

test('single distinctive names must describe the named market rather than a street address', () => {
  const sunnyside = { name: 'Sunnyside Farmers Market', location: { city: 'Granger' } };
  assert.equal(identitySupported(sunnyside, [citation('https://granger.test', 'Granger Farmers Market at 121 Sunnyside Ave, Granger WA')]), false);
  assert.equal(identitySupported(sunnyside, [citation('https://sunnyside.test', 'Sunnyside Certified Farmers Market in Granger WA')]), true);
  assert.equal(identitySupported({ name: 'SCIO Farmers Market', location: { city: 'Sheboygan' } }, [citation('https://scio.test', 'SCIO Farmers Market in Sheboygan WI')]), true);
});
