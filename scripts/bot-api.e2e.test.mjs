/**
 * End-to-end checks for the outreach bot API against a running dev server
 * and a non-production database. Not part of `bun run test` (it needs both).
 *
 *   BOT_API_BASE=http://localhost:3000 node --env-file=.env.local --test scripts/bot-api.e2e.test.mjs
 *
 * It edits one market, uploads one generated photo to Blob, then puts the
 * market's override back, deletes the photo file and its rows, and deletes
 * every bot_actions row it created. Refuses to run against production.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { neon } from '@neondatabase/serverless';
import { del } from '@vercel/blob';
import sharp from 'sharp';

const BASE = process.env.BOT_API_BASE ?? 'http://localhost:3000';
const TOKEN = process.env.ORGANIZER_BOT_TOKEN;
const DB_URL = process.env.DATABASE_URL ?? '';
const SLUG = process.env.BOT_API_MARKET ?? 'heart-of-the-city-market';
const NOTE = 'E2E test of the bot API (scripts/bot-api.e2e.test.mjs)';

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Run this against a local dev server only.');
if (!DB_URL || DB_URL.includes('ep-wild-king')) throw new Error('Refusing to run against the production database.');

const sql = neon(DB_URL);
let marketId;
let originalOverride;
const createdAudit = new Set();
const createdBlobs = new Set();

async function call(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
  });
  const body = await response.json();
  if (body?.audit_id) createdAudit.add(body.audit_id);
  for (const item of body?.pending_requests ?? []) createdAudit.add(item.id);
  for (const photo of body?.photos ?? []) createdBlobs.add(photo.url);
  return { status: response.status, body };
}

const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => {
  const [row] = await sql`select id from markets where slug = ${SLUG} limit 1`;
  assert.ok(row, `market ${SLUG} is not in the database mirror`);
  marketId = row.id;
  [originalOverride] = await sql`select data, updated_by from market_overrides where market_id = ${marketId}`;
});

after(async () => {
  if (!marketId) return;
  if (originalOverride) {
    await sql`update market_overrides set data = ${JSON.stringify(originalOverride.data)}::jsonb, updated_by = ${originalOverride.updated_by} where market_id = ${marketId}`;
  } else {
    await sql`delete from market_overrides where market_id = ${marketId}`;
  }
  for (const url of createdBlobs) {
    await del(url).catch(() => {});
    await sql`delete from market_photos where blob_url = ${url}`;
  }
  if (createdAudit.size) await sql`delete from bot_actions where id = any(${[...createdAudit]}::uuid[])`;
});

test('401 without or with a wrong token', async () => {
  for (const path of ['/api/bot/listing-edits', '/api/bot/photos', '/api/bot/photo-removals', '/api/bot/organizer-access']) {
    const none = await fetch(`${BASE}${path}`, json({}));
    assert.equal(none.status, 401, path);
    const wrong = await fetch(`${BASE}${path}`, { ...json({}), headers: { authorization: 'Bearer nope', 'content-type': 'application/json' } });
    assert.equal(wrong.status, 401, path);
  }
});

test('400 for invalid edits, 404 for an unknown market', async () => {
  const bad = await call('/api/bot/listing-edits', json({ market: SLUG, note: NOTE, changes: { schedules: [{ weekdays: ['saturday'], opens: '13:00', closes: '08:00' }] } }));
  assert.equal(bad.status, 400);
  assert.ok(bad.body.issues.some((issue) => issue.path.startsWith('changes.schedules')));
  const noNote = await call('/api/bot/listing-edits', json({ market: SLUG, changes: {} }));
  assert.equal(noNote.status, 400);
  const missing = await call('/api/bot/listing-edits', json({ market: 'no-such-market-zzz', note: NOTE, changes: {} }));
  assert.equal(missing.status, 404);
});

test('hours and location publish to market_overrides with an audit row', async () => {
  const changes = {
    schedules: [{ weekdays: ['wednesday'], opens: '07:00', closes: '15:30' }],
    location: { address: '1182 Market St', coordinates: { lat: 37.7793, lon: -122.4144 } },
  };
  const { status, body } = await call('/api/bot/listing-edits', json({ market: `https://www.farmermarkets.app/markets/${SLUG}`, note: NOTE, email: 'operator@example.test', changes }));
  assert.equal(status, 200, JSON.stringify(body));
  assert.deepEqual(body.sections.sort(), ['location', 'schedules']);
  assert.equal(body.pending, false);
  const [override] = await sql`select data, updated_by from market_overrides where market_id = ${marketId}`;
  assert.equal(override.updated_by, 'outreach-bot');
  assert.equal(override.data.schedules[0].closes, '15:30');
  assert.equal(override.data.location.coordinates.lat, 37.7793);
  const [audit] = await sql`select action, status, note, operator_email, details from bot_actions where id = ${body.audit_id}`;
  assert.equal(audit.action, 'listing_edit');
  assert.equal(audit.status, 'applied');
  assert.equal(audit.operator_email, 'operator@example.test');
  assert.deepEqual(audit.details.sections.sort(), ['location', 'schedules']);

  // The same edit again is a no-op and writes nothing.
  const again = await call('/api/bot/listing-edits', json({ market: SLUG, note: NOTE, changes }));
  assert.equal(again.status, 200);
  assert.deepEqual(again.body.sections, []);
  assert.equal(again.body.audit_id, null);
});

test('removing or permanently closing a listing does not change overrides and is pending', async () => {
  const [beforeOverride] = await sql`select data from market_overrides where market_id = ${marketId}`;
  const removal = await call('/api/bot/listing-edits', json({ market: SLUG, note: NOTE, remove_listing: true }));
  assert.equal(removal.status, 202);
  assert.equal(removal.body.pending, true);
  const closed = await call('/api/bot/listing-edits', json({ market: SLUG, note: NOTE, changes: { status: { value: 'permanently_closed' } } }));
  assert.equal(closed.status, 202);
  assert.deepEqual(closed.body.sections, []);
  assert.equal(closed.body.pending_requests[0].action, 'close_listing');
  const [afterOverride] = await sql`select data from market_overrides where market_id = ${marketId}`;
  assert.deepEqual(afterOverride.data, beforeOverride.data);
  assert.equal(afterOverride.data.status, undefined);
  const rows = await sql`select action, status from bot_actions where id = any(${[removal.body.audit_id, closed.body.pending_requests[0].id]}::uuid[])`;
  assert.deepEqual(rows.map((row) => row.status), ['pending', 'pending']);
});

test('photos: HEIC and non-images are refused, a JPEG publishes approved', async () => {
  const form = (blob, name) => {
    const data = new FormData();
    data.set('market', SLUG);
    data.set('note', NOTE);
    data.set('credit', 'Test Farm');
    data.append('photo', blob, name);
    return { method: 'POST', body: data };
  };
  const heic = await call('/api/bot/photos', form(new Blob([new TextEncoder().encode('\0\0\0\x18ftypheic\0\0\0\0mif1heic')]), 'IMG_0001.HEIC'));
  assert.equal(heic.status, 415);
  assert.match(heic.body.error, /HEIC/);
  const text = await call('/api/bot/photos', form(new Blob(['hello']), 'notes.txt'));
  assert.equal(text.status, 415);

  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#5a8f3c' } }).jpeg().toBuffer();
  const { status, body } = await call('/api/bot/photos', form(new Blob([jpeg], { type: 'image/jpeg' }), 'market.jpg'));
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.photos.length, 1);
  assert.match(body.photos[0].url, /\.public\.blob\.vercel-storage\.com\/markets\//);
  const [photo] = await sql`select status, width, height, caption, uploaded_by, reviewed_at from market_photos where id = ${body.photos[0].id}`;
  assert.equal(photo.status, 'approved');
  assert.equal(photo.width, 64);
  assert.equal(photo.caption, 'Photo: Test Farm');
  assert.equal(photo.uploaded_by, null);
  assert.ok(photo.reviewed_at);

  // Asking to remove it leaves it live and opens a pending item.
  const removal = await call('/api/bot/photo-removals', json({ market: SLUG, note: NOTE, photos: [body.photos[0].id, 'https://example.com/other.jpg'] }));
  assert.equal(removal.status, 202);
  assert.deepEqual(removal.body.matched_photo_ids, [body.photos[0].id]);
  assert.deepEqual(removal.body.unmatched, ['https://example.com/other.jpg']);
  const [still] = await sql`select status from market_photos where id = ${body.photos[0].id}`;
  assert.equal(still.status, 'approved');
});
