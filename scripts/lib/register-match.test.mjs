import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalProfileUrl,
  distinctiveTokens,
  formatUsPhone,
  handleBelongsToMarket,
  matchKind,
  matchRegister,
  usableWebsite,
} from './register-match.mjs';

test('distinctive tokens drop generic market words and possessives', () => {
  assert.deepEqual(distinctiveTokens("Downtown SLO Farmers' Market"), ['downtown', 'slo']);
  assert.deepEqual(distinctiveTokens('Slo Tuesday Farmers Market At Farm Supply 40FM2608'), ['slo', 'tuesday', 'supply']);
  assert.deepEqual(distinctiveTokens("Farmer's Market"), []);
});

test('match kinds: same words within 1 km, most words within 250 m, nothing otherwise', () => {
  assert.equal(matchKind('Downtown SLO Farmers Market', "Downtown Slo Farmers' Market", 900), 'exact');
  assert.equal(matchKind('Downtown SLO Farmers Market', "Downtown Slo Farmers' Market", 1200), null);
  assert.equal(matchKind('Martin Farmers Market', 'Martin Area Farmers Market', 155), null);
  assert.equal(matchKind('Rose Garden Sunday Farmers Market', 'Rose Garden Farmers Market', 100), 'near');
  assert.equal(matchKind('Farmers Market', 'Farmers Market', 5), null);
  assert.equal(matchKind('Saturday Market', 'Tuesday Market', 5), null);
});

test('register matching is one to one and drops ties', () => {
  const a = { name: 'Rose Garden Farmers Market', lat: 37.33, lon: -121.92 };
  const b = { name: 'Willow Glen Farmers Market', lat: 37.307, lon: -121.9 };
  const rows = [
    { name: 'Rose Garden Farmers Market', lat: 37.3301, lon: -121.9201 },
    { name: 'Willow Glen Farmers Market', lat: 37.3071, lon: -121.9001 },
    { name: 'Willow Glen Farmers Market', lat: 37.3071, lon: -121.9002 },
  ];
  const pairs = matchRegister([a, b], rows);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0][0], a);
  assert.equal(pairs[0][1], rows[0]);
  assert.equal(pairs[0][3], 'exact');
});

test('two listings cannot claim one register row', () => {
  const rows = [{ name: 'Kaiser Farmers Market', lat: 37.3, lon: -121.9 }];
  const listings = [
    { name: 'Kaiser Farmers Market', lat: 37.3001, lon: -121.9 },
    { name: 'Kaiser Farmers Market', lat: 37.3001, lon: -121.9001 },
  ];
  assert.equal(matchRegister(listings, rows).length, 0);
});

test('profile urls: plain profiles only', () => {
  assert.equal(canonicalProfileUrl('http://facebook.com/hampdenfarmersmarket/'), 'https://www.facebook.com/hampdenfarmersmarket');
  assert.equal(canonicalProfileUrl('https://www.facebook.com/559152993949710'), 'https://www.facebook.com/559152993949710');
  assert.equal(canonicalProfileUrl('https://instagram.com/slofarmers?hl=en'), 'https://www.instagram.com/slofarmers');
  assert.equal(canonicalProfileUrl('http://www.facebook.com/2008/fbml'), null);
  assert.equal(canonicalProfileUrl('https://www.facebook.com/sharer/sharer.php?u=x'), null);
  assert.equal(canonicalProfileUrl('https://www.facebook.com/events/123'), null);
  assert.equal(canonicalProfileUrl('https://www.instagram.com/p/abc/'), null);
  assert.equal(canonicalProfileUrl('https://example.com/facebook'), null);
});

test('a handle must read as the market, not its parent body', () => {
  const market = { name: 'Fayette CO. Farmers Market', city: 'Fayette', websiteHost: 'www.aces.edu' };
  assert.equal(handleBelongsToMarket('https://www.facebook.com/AlabamaExtension', market), false);
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/crawfordsvillefarmersmarket', {
      name: 'Crawfordsville Farmers Market', city: 'Crawfordsville', websiteHost: 'www.crawfordsville.in.gov',
    }),
    true
  );
  assert.equal(
    handleBelongsToMarket('https://www.instagram.com/pittsfieldtwp', {
      name: 'Pittsfield Township Farmers Market', city: 'Ann Arbor', websiteHost: 'www.pittsfield-mi.gov',
    }),
    false
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/hampdenfarmersmarket', {
      name: 'Hampden Winter Farmers’ Market', city: 'Hampden', websiteHost: 'www.hampdenfarmersmarket.com',
    }),
    true
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/GreatValleyBerryPatch', {
      name: 'Great Valley Berry Patch Farm Stand', city: 'Great Valley', websiteHost: 'www.greatvalleyberrypatch.com',
    }),
    true
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/GFFarmersMarket', {
      name: 'Glens Falls Farmers’ Market', city: 'Glens Falls', websiteHost: 'www.glensfallsfarmersmarket.com',
    }),
    true
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/cityofmoore', {
      name: 'City of Moore Farmers’ Market', city: 'Moore', websiteHost: 'www.cityofmoore.com',
    }),
    false
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/citycenteratoysterpoint', {
      name: 'Farmers’ Market at City Center', city: 'Newport News', websiteHost: 'www.citycenteratoysterpoint.com',
    }),
    false
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/newbrightonpa', {
      name: 'New Brighton Farmers Market', city: 'New Brighton', websiteHost: 'www.newbrightonpa.org',
    }),
    false
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/FoodlinkNY', {
      name: 'Curbside Market-the Hub at Elite', city: 'Rochester', websiteHost: 'foodlinkny.org',
    }),
    false
  );
  assert.equal(
    handleBelongsToMarket('https://www.facebook.com/OsageChamberofCommerce', {
      name: 'Osage Farmers Market', city: 'Osage', websiteHost: 'www.osagechamber.com',
    }),
    false
  );
});

test('phones and websites', () => {
  assert.equal(formatUsPhone('+18055410286'), '805-541-0286');
  assert.equal(formatUsPhone('555'), null);
  assert.equal(formatUsPhone('+441632960961'), null);
  assert.equal(usableWebsite('http://www.downtownslo.com/farmers-market?utm_source=fb'), 'http://www.downtownslo.com/farmers-market');
  assert.equal(usableWebsite('https://www.facebook.com/x'), null);
  assert.equal(usableWebsite('https://linktr.ee/x'), null);
  assert.equal(usableWebsite('https://www.yelp.com/biz/x'), null);
});
