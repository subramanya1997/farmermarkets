import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSourcePostalCode } from './postal.ts';

const hamLake = {
  country_code: 'US', last_updated: '2023-02-22',
  location: { address: '14630 Hwy 65 NE, Ham Lake, MN 55304', state: 'Minnesota', zip_code: '14630' },
};

test('repairs street-number ZIP from an explicit matching-state address without changing the source', () => {
  const result = normalizeSourcePostalCode(hamLake);
  assert.equal(result.location.zip_code, '55304');
  assert.equal(result.last_updated, hamLake.last_updated);
  assert.equal(hamLake.location.zip_code, '14630');
});
test('keeps ZIP+4 and full state names when explicitly present', () => {
  const m = { ...hamLake, location: { ...hamLake.location, address: '14630 Hwy 65 NE, Ham Lake, Minnesota, 55304-1234' } };
  assert.equal(normalizeSourcePostalCode(m).location.zip_code, '55304-1234');
});
test('does not infer a postal code when only a street number is available', () => {
  const m = { ...hamLake, location: { ...hamLake.location, address: '14630 Hwy 65 NE, Ham Lake, MN' } };
  assert.strictEqual(normalizeSourcePostalCode(m), m);
});
test('does not overwrite a postal code that is not the leading street number', () => {
  const m = { ...hamLake, location: { ...hamLake.location, zip_code: '55303' } };
  assert.strictEqual(normalizeSourcePostalCode(m), m);
});
test('does not repair international or conflicting-state addresses', () => {
  const ca = { ...hamLake, country_code: 'CA' };
  assert.strictEqual(normalizeSourcePostalCode(ca), ca);
  const wrongState = { ...hamLake, location: { ...hamLake.location, address: '14630 Hwy 65 NE, Ham Lake, WI 55304' } };
  assert.strictEqual(normalizeSourcePostalCode(wrongState), wrongState);
});
