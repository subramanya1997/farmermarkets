import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeListingEdits, parseListingEdits, sectionsThatDiffer, type ListingEdits } from './listingEdits.ts';
import { ORGANIZER_SOURCE_ID, applyListingEdits, listingEditsFromMarket, type OverlayableMarket } from './organizerOverlay.ts';

const meta = { approvedAt: '2026-11-20', listingUrl: 'https://www.farmermarkets.app/markets/test-market' };

function baseRecord(): OverlayableMarket & { id: string; name: string } {
  return {
    id: 'm1',
    name: 'Test Market',
    visitor_note: 'Old note',
    organization: { description: 'Old description' },
    contact: { websites: ['https://old.example.com'], phone_numbers: ['555-111-2222'], emails: [], social_media: [] },
    operations: { season: 'May - October', days: ['Saturday 8am-1pm'] },
    payment: { methods: ['Cash'], food_assistance: { snap: true, snap_option: 'tokens' } },
    amenities: { description: 'Plenty of parking and restrooms nearby' },
    products: { items: ['Apples'], categories: { fresh_produce: true } },
    enrichment: {
      verified_at: '2026-09-01',
      verification_scope: 'partial' as const,
      sources: [{ id: 'site', url: 'https://old.example.com', title: 'Market site', fields: ['hours'] }],
    },
  };
}

test('valid edits are accepted and cleaned', () => {
  const parsed = parseListingEdits({
    about: { description: '  Fresh food\r\n\r\n\r\n\r\nevery week  ', visitor_note: '' },
    schedules: [{ weekdays: ['saturday'], opens: '08:00', closes: '13:00', label: '' }],
    contact: {
      websites: ['https://market.example.org'],
      phone_numbers: ['(555) 123-4567'],
      emails: ['Hello@Market.example.org '],
      social_profiles: [{ platform: 'instagram', url: 'https://instagram.com/testmarket' }],
      newsletter_url: '',
      online_ordering_url: '',
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.edits.about?.description, 'Fresh food\n\nevery week');
  assert.equal(parsed.edits.about?.visitor_note, undefined);
  assert.equal(parsed.edits.schedules?.[0].label, undefined);
  assert.deepEqual(parsed.edits.contact?.emails, ['hello@market.example.org']);
  assert.equal(parsed.edits.contact?.newsletter_url, undefined);
});

test('unsafe or malformed input is rejected', () => {
  const cases: unknown[] = [
    { contact: { websites: ['javascript:alert(1)'], phone_numbers: [], emails: [], social_profiles: [] } },
    { schedules: [{ weekdays: ['saturday'], opens: '13:00', closes: '08:00' }] },
    { schedules: [{ weekdays: [], opens: '08:00', closes: '13:00' }] },
    { events: [{ name: 'Fair', kind: 'festival', start: '2027-06-02', end: '2027-06-01' }] },
    { about: { description: 'x'.repeat(1501) } },
    { unknown_section: true },
  ];
  for (const input of cases) assert.equal(parseListingEdits(input).ok, false, JSON.stringify(input));
});

test('applying edits never mutates the dataset record', () => {
  const raw = baseRecord();
  const snapshot = structuredClone(raw);
  applyListingEdits(raw, { about: { description: 'New' }, payments: { methods: ['cash'], assistance: [], incentives: [] } }, meta);
  assert.deepEqual(raw, snapshot);
});

test('hours, payments and amenities land in both rich facts and flat fields', () => {
  const edits: ListingEdits = {
    schedules: [{ weekdays: ['wednesday', 'saturday'], opens: '09:00', closes: '14:00' }],
    season: { kind: 'year_round' },
    payments: { methods: ['cash', 'credit_card'], assistance: ['snap_ebt', 'wic'], incentives: [] },
    amenities: { available: ['restrooms'], parking: 'no', pets: 'not_allowed' },
  };
  const next = applyListingEdits(baseRecord(), edits, meta);

  const schedules = next.first_party?.operations?.schedules ?? [];
  assert.equal(schedules.length, 1);
  assert.deepEqual(schedules[0].source_ids, [ORGANIZER_SOURCE_ID]);
  assert.equal(schedules[0].verified_at, '2026-11-20');
  assert.deepEqual(next.operations?.days, ['Wednesday, Saturday 09:00-14:00']);
  assert.equal(next.operations?.season, 'Year-round');

  assert.deepEqual(next.payment?.methods, ['Cash', 'Credit Card']);
  assert.equal(next.payment?.food_assistance?.snap, true);
  assert.equal(next.payment?.food_assistance?.wic, true);
  assert.equal(next.payment?.food_assistance?.snap_option, 'tokens');

  // The free-text amenity description said "parking"; the organizer said no.
  assert.equal(next.amenities?.description, undefined);
  assert.equal(next.amenities?.parking, false);
  assert.equal(next.amenities?.restrooms, true);
  assert.equal(next.amenities?.pet_friendly, false);
});

test('untouched sections keep dataset values and the organizer is cited', () => {
  const next = applyListingEdits(baseRecord(), { about: { description: 'Organizer text' } }, meta);
  assert.equal(next.organization?.description, 'Organizer text');
  assert.equal(next.visitor_note, undefined);
  assert.deepEqual(next.operations?.days, ['Saturday 8am-1pm']);
  assert.deepEqual(next.payment?.methods, ['Cash']);
  const sources = next.enrichment?.sources ?? [];
  assert.equal(sources.length, 2);
  const organizer = sources.find((s) => s.id === ORGANIZER_SOURCE_ID);
  assert.ok(organizer);
  assert.deepEqual(organizer.fields, ['about']);
  assert.equal(organizer.url, 'https://old.example.com');
  assert.equal(next.enrichment?.verified_at, '2026-09-01');
});

test('collection item ids are unique even for repeated names', () => {
  const next = applyListingEdits(
    baseRecord(),
    { vendors: { roster: [{ name: 'Farm Stand' }, { name: 'Farm Stand' }, { name: '!!!' }] } },
    meta,
  );
  const ids = (next.first_party?.vendors?.roster ?? []).map((item: { id: string }) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('approved sections merge over earlier ones and no-op sections are detected', () => {
  const published: ListingEdits = { about: { description: 'A' }, season: { kind: 'year_round' } };
  const merged = mergeListingEdits(published, { about: { description: 'B' } });
  assert.deepEqual(merged, { about: { description: 'B' }, season: { kind: 'year_round' } });
  assert.deepEqual(sectionsThatDiffer(published, { season: { kind: 'year_round' }, about: { description: 'C' } }), ['about']);
});

test('prefill reads the current listing and drops entries the editor would reject', () => {
  const edits = listingEditsFromMarket(
    {
      organization_description: 'About us',
      websites: ['https://market.example.org', 'not a url'],
      phone_numbers: ['555-123-4567'],
      emails: ['info@market.example.org'],
      social_media: ['https://www.facebook.com/testmarket'],
      accepts_cash: true,
      snap: true,
      has_fresh_produce: true,
      has_jams: true,
      first_party: {
        events: [
          { id: 'e1', source_ids: ['s'], verified_at: '2026-01-01', value: { name: 'Past fair', kind: 'festival', start: '2025-06-01' } },
          { id: 'e2', source_ids: ['s'], verified_at: '2026-01-01', value: { name: 'Harvest fair', kind: 'festival', start: '2027-09-12' } },
        ],
      },
    },
    '2026-11-20',
  );
  assert.deepEqual(edits.contact?.websites, ['https://market.example.org']);
  assert.deepEqual(edits.contact?.social_profiles, [{ platform: 'facebook', url: 'https://www.facebook.com/testmarket' }]);
  assert.deepEqual(edits.payments?.methods, ['cash']);
  assert.deepEqual(edits.payments?.assistance, ['snap_ebt']);
  assert.deepEqual(edits.products?.categories, ['fresh_produce', 'preserves']);
  assert.deepEqual(edits.events?.map((e) => e.name), ['Harvest fair']);
  assert.equal(parseListingEdits(edits).ok, true);
});
