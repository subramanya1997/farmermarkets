import assert from 'node:assert/strict';
import test from 'node:test';
import { altMarketName, checkAlt, normalizeAlt } from './photo-alt.mjs';

test('normalizeAlt turns pause dashes into commas and drops the full stop', () => {
  assert.equal(
    normalizeAlt('Ballard Farmers Market — shoppers at a  flower stand.'),
    'Ballard Farmers Market, shoppers at a flower stand',
  );
  assert.equal(normalizeAlt('Kenton market - a vendor at a stall'), 'Kenton market, a vendor at a stall');
  assert.equal(normalizeAlt('a farm-fresh egg stand'), 'a farm-fresh egg stand');
});

test('checkAlt accepts the operator style', () => {
  assert.deepEqual(
    checkAlt('Fruitvale farmers market, a farmer holding broccoli at a produce stand piled with carrots, beets and greens', 'Fruitvale farmers market'),
    [],
  );
});

test('checkAlt flags template, framing, marketing words and missing names', () => {
  assert.ok(checkAlt('Ballard Farmers Market, a photo of tents', 'Ballard Farmers Market').includes('photo-of'));
  assert.ok(checkAlt('Ballard Farmers Market, a vibrant scene of shoppers', 'Ballard Farmers Market').includes('marketing-word'));
  assert.ok(checkAlt('Shoppers at a flower stand in Seattle', 'Ballard Farmers Market').includes('market-name'));
  assert.ok(checkAlt(`Ballard Farmers Market, ${'tents and shoppers '.repeat(10)}`, 'Ballard Farmers Market').includes('too-long'));
  assert.ok(checkAlt('Ballard Farmers Market, tents', 'Ballard Farmers Market').includes('too-short'));
});

test('altMarketName keeps the comma as the only break after the name', () => {
  assert.equal(altMarketName('Portland Farmers Market - Kenton'), 'Portland Farmers Market (Kenton)');
  assert.equal(altMarketName('Ballard Farmers Market'), 'Ballard Farmers Market');
});
