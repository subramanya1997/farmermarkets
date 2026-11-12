import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRegisterRecord, registerRecordProblems } from './register-merge.mjs';

const overture = { title: 'Overture Maps places, release 2026-10-21.0', url: 'https://overturemaps.org/' };
const research = {
  id: '1',
  market_name: 'Rose Garden Farmers Market',
  verified_at: '2026-08-30',
  verification_scope: 'partial',
  contact: { websites: ['https://rosegarden.example/'], social_media: ['https://www.instagram.com/rosegardenfm'] },
  sources: [{ title: 'Rose Garden', url: 'https://rosegarden.example/', fields: ['contact.websites', 'contact.social_media'] }],
};

test('a register record fills gaps and never replaces research', () => {
  const merged = mergeRegisterRecord(research, {
    id: '1',
    market_name: 'Rose Garden Farmers Market',
    verified_at: '2026-11-11',
    contact: {
      websites: ['https://other.example/'],
      phone_numbers: ['408-555-0100'],
      social_media: ['https://www.facebook.com/123456', 'https://www.instagram.com/someoneelse'],
    },
    payment: { food_assistance: { snap: true } },
    sources: [
      { ...overture, fields: ['contact.websites', 'contact.phone_numbers', 'contact.social_media'] },
      { title: 'USDA SNAP Retailer Locator', url: 'https://www.fns.usda.gov/snap/retailer-locator', fields: ['payment.food_assistance.snap'] },
    ],
  });
  assert.deepEqual(merged.contact.websites, ['https://rosegarden.example/']);
  assert.deepEqual(merged.contact.phone_numbers, ['408-555-0100']);
  assert.deepEqual(merged.contact.social_media, ['https://www.instagram.com/rosegardenfm', 'https://www.facebook.com/123456']);
  assert.equal(merged.payment.food_assistance.snap, true);
  assert.equal(merged.verified_at, '2026-08-30');
  assert.deepEqual(merged.sources[1].fields, ['contact.phone_numbers', 'contact.social_media']);
  assert.equal(merged.sources.length, 3);
});

test('a register record that adds nothing leaves the research record untouched', () => {
  const same = mergeRegisterRecord(research, {
    id: '1',
    market_name: 'Rose Garden Farmers Market',
    verified_at: '2026-11-11',
    contact: { websites: ['https://other.example/'], social_media: ['https://www.instagram.com/x'] },
    sources: [{ ...overture, fields: ['contact.websites', 'contact.social_media'] }],
  });
  assert.equal(same, research);
});

test('researched "no SNAP" survives the register', () => {
  const existing = { ...research, payment: { food_assistance: { snap: false } } };
  const merged = mergeRegisterRecord(existing, {
    id: '1',
    market_name: 'Rose Garden Farmers Market',
    verified_at: '2026-11-11',
    payment: { food_assistance: { snap: true } },
    sources: [{ title: 'USDA', url: 'https://www.fns.usda.gov/snap/retailer-locator', fields: ['payment.food_assistance.snap'] }],
  });
  assert.equal(merged, existing);
});

test('register records are limited to contact links and the SNAP flag', () => {
  assert.deepEqual(registerRecordProblems({ id: '1', contact: { social_media: [] }, sources: [] }), []);
  assert.ok(registerRecordProblems({ id: '1', operations: { days: ['Sat 9 AM'] }, sources: [] }).length);
  assert.ok(registerRecordProblems({ id: '1', payment: { food_assistance: { snap: false } }, sources: [] }).length);
  assert.ok(registerRecordProblems({ id: '1', payment: { food_assistance: { wic: true } }, sources: [] }).length);
});
