import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bearerTokenMatches,
  botListingEditsBody,
  botPhotoFields,
  botPhotoRemovalBody,
  fillFromLive,
  photoCaption,
  sniffImage,
  splitBotEdits,
} from './botRequests.ts';
import { parseListingEdits } from './listingEdits.ts';

const TOKEN = 'x'.repeat(40);
const NOTE = 'Operator emailed new hours on Nov 18, 2026';

test('bearer token: refuses missing, wrong, malformed and short tokens', () => {
  assert.equal(bearerTokenMatches(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(bearerTokenMatches(`bearer   ${TOKEN}  `, TOKEN), true);
  assert.equal(bearerTokenMatches(null, TOKEN), false);
  assert.equal(bearerTokenMatches('', TOKEN), false);
  assert.equal(bearerTokenMatches(TOKEN, TOKEN), false, 'no Bearer prefix');
  assert.equal(bearerTokenMatches(`Bearer ${TOKEN}y`, TOKEN), false);
  assert.equal(bearerTokenMatches(`Basic ${TOKEN}`, TOKEN), false);
  // An unset or short configured token refuses everything, even a match.
  assert.equal(bearerTokenMatches('Bearer short', 'short'), false);
  assert.equal(bearerTokenMatches('Bearer ', undefined), false);
  assert.equal(bearerTokenMatches(`Bearer ${TOKEN}`, '   '), false);
});

test('listing edits body: needs a market, a real note, and exactly one of changes or remove_listing', () => {
  assert.equal(botListingEditsBody.safeParse({ market: 'm', note: NOTE, changes: {} }).success, true);
  assert.equal(botListingEditsBody.safeParse({ market: 'm', note: NOTE, remove_listing: true }).success, true);
  const bad: unknown[] = [
    { note: NOTE, changes: {} },
    { market: 'm', changes: {} },
    { market: 'm', note: 'short', changes: {} },
    { market: 'm', note: NOTE },
    { market: 'm', note: NOTE, changes: {}, remove_listing: true },
    { market: 'm', note: NOTE, remove_listing: false },
    { market: 'm', note: NOTE, changes: {}, delete: true },
    { market: 'm', note: NOTE, changes: {}, email: 'not an email' },
  ];
  for (const body of bad) assert.equal(botListingEditsBody.safeParse(body).success, false, JSON.stringify(body));
});

test('listing edits: identity and location are allowed for the bot (admin schema), junk is not', () => {
  const ok = parseListingEdits(
    {
      identity: { name: 'Heart of the City Farmers Market' },
      location: { address: '1182 Market St', coordinates: { lat: 37.78, lon: -122.41 } },
      schedules: [{ weekdays: ['wednesday'], opens: '07:00', closes: '17:00' }],
    },
    { admin: true },
  );
  assert.equal(ok.ok, true);
  assert.equal(parseListingEdits({ schedules: [{ weekdays: ['saturday'], opens: '13:00', closes: '08:00' }] }, { admin: true }).ok, false);
  assert.equal(parseListingEdits({ location: { coordinates: { lat: 120, lon: 0 } } }, { admin: true }).ok, false);
  assert.equal(parseListingEdits({ delete_market: true }, { admin: true }).ok, false);
});

test('split: permanently closed is held for an admin, everything else publishes', () => {
  const parsed = parseListingEdits(
    {
      status: { value: 'permanently_closed', note: 'Closed for good' },
      schedules: [{ weekdays: ['saturday'], opens: '08:00', closes: '12:00' }],
    },
    { admin: true },
  );
  assert.ok(parsed.ok);
  const { publish, held } = splitBotEdits(parsed.edits);
  assert.equal(publish.status, undefined);
  assert.equal(held.status?.value, 'permanently_closed');
  assert.ok(publish.schedules);

  const seasonal = parseListingEdits({ status: { value: 'seasonal_break', effective_date: '2026-12-01' } }, { admin: true });
  assert.ok(seasonal.ok);
  const split = splitBotEdits(seasonal.edits);
  assert.equal(split.publish.status?.value, 'seasonal_break');
  assert.deepEqual(split.held, {});
});

test('photo removal body: at least one photo, note required', () => {
  assert.equal(botPhotoRemovalBody.safeParse({ market: 'm', note: NOTE, photos: ['abc'] }).success, true);
  assert.equal(botPhotoRemovalBody.safeParse({ market: 'm', note: NOTE, photos: [] }).success, false);
  assert.equal(botPhotoRemovalBody.safeParse({ market: 'm', photos: ['abc'] }).success, false);
  assert.equal(botPhotoFields.safeParse({ market: 'm', note: '' }).success, false);
});

test('sniff: real types from magic bytes, HEIC recognised so it can be refused', () => {
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpeg');
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'png');
  assert.equal(sniffImage(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(sniffImage(new TextEncoder().encode('\0\0\0\x18ftypheic\0\0\0\0')), 'heic');
  assert.equal(sniffImage(new TextEncoder().encode('\0\0\0\x18ftypmif1\0\0\0\0')), 'heic');
  assert.equal(sniffImage(new TextEncoder().encode('GIF89a......')), null);
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')), null);
  assert.equal(sniffImage(new Uint8Array([])), null);
});

test('caption joins caption and credit', () => {
  assert.equal(photoCaption(), null);
  assert.equal(photoCaption('Opening day', undefined), 'Opening day');
  assert.equal(photoCaption(undefined, 'Pat Lee'), 'Photo: Pat Lee');
  assert.equal(photoCaption('Opening day', 'Pat Lee'), 'Opening day. Photo: Pat Lee');
  assert.equal(photoCaption('x'.repeat(300))?.length, 200);
});

test('fill from live: object sections keep the fields the bot did not send, lists replace', () => {
  const live = {
    location: { address: 'Old St', zip_code: '94102', location_description: 'UN Plaza' },
    contact: { websites: ['https://old.example.org'], phone_numbers: [], emails: [], social_profiles: [] },
    schedules: [{ weekdays: ['saturday' as const], opens: '08:00', closes: '12:00' }],
  };
  const filled = fillFromLive(live, {
    location: { address: '1182 Market St' },
    contact: { phone_numbers: ['415-555-0100'] },
    schedules: [{ weekdays: ['wednesday'], opens: '07:00', closes: '15:00' }],
    payments: { methods: ['cash'], assistance: ['snap_ebt'], incentives: [] },
  });
  assert.deepEqual(filled.location, { address: '1182 Market St', zip_code: '94102', location_description: 'UN Plaza' });
  assert.deepEqual((filled.contact as { websites: string[] }).websites, ['https://old.example.org']);
  assert.deepEqual(filled.schedules, [{ weekdays: ['wednesday'], opens: '07:00', closes: '15:00' }]);
  const parsed = parseListingEdits(filled, { admin: true });
  assert.equal(parsed.ok, true);
});
