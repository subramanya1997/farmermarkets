import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteWebsiteAudit } from './promote-website-audit.mjs';
import { validateRichEnrichment } from './lib/rich-enrichment-validation.mjs';

const verifiedAt = '2026-08-21';

function fixture(overrides = {}) {
  const row = {
    row_key: 'legacy:1:riverside-farmers-market-riverside',
    market_id: '1',
    market_name: 'Riverside Farmers Market',
    location: { city: 'Riverside', state: 'CA', zip_code: '92501', country: 'USA' },
    ...overrides.row,
  };
  const target = {
    target_id: 'abcdef0123456789',
    row_keys: [row.row_key],
    linked_markets: 1,
    risk_class: 'single_market_page',
    ...overrides.target,
  };
  const result = {
    target_id: target.target_id,
    final_url: 'https://riversidemarket.example/visit',
    page_title: 'Riverside Farmers Market | Visitor Information',
    h1: ['Riverside Farmers Market'],
    headings: ['Plan your visit'],
    disposition: 'rendered_identity_matched',
    identity_decisions: [{ row_key: row.row_key, identity_match: true, name_match: true, locality_match: true }],
    evidence: [],
    relevant_links: [],
    ...overrides.result,
  };
  return { rows: [row], targets: [target], results: [result], details: overrides.details ?? [], verifiedAt };
}

function promote(overrides) {
  return promoteWebsiteAudit(fixture(overrides));
}

test('promotes exact market-scoped facts and produces validator-compatible rich JSON', () => {
  const { records, dispositions } = promote({ result: { evidence: [
    { kind: 'schedule', excerpt: 'Open May 2 through October 31, 2026.' },
    { kind: 'payment', excerpt: 'The market accepts cash, credit cards, and debit cards.' },
    { kind: 'assistance', excerpt: 'The market accepts SNAP/EBT and WIC.' },
    { kind: 'assistance', excerpt: 'Market Match doubles SNAP benefits up to $20 per market day.' },
    { kind: 'parking', excerpt: 'Free parking is available beside the market entrance.' },
    { kind: 'accessibility', excerpt: 'The market is wheelchair accessible.' },
    { kind: 'pets', excerpt: 'Dogs are not allowed except for service animals.' },
    { kind: 'weather', excerpt: 'The market is open rain or shine.' },
    { kind: 'vendors', excerpt: 'Shop weekly from more than 60 vendors.' },
    { kind: 'products', excerpt: 'Our market features fresh produce, eggs, baked goods, flowers, and honey.' },
  ] } });
  assert.equal(dispositions.promoted, 1);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].first_party.operations.season.value, {
    kind: 'dated_range', start_date: '2026-05-02', end_date: '2026-10-31',
  });
  assert.equal(records[0].first_party.operations.schedules, undefined);
  assert.deepEqual(records[0].first_party.payments.methods.map((item) => item.value.code), ['cash', 'credit_card', 'debit_card']);
  assert.deepEqual(records[0].first_party.payments.assistance.map((item) => item.value.code), ['snap_ebt', 'wic']);
  assert.equal(records[0].first_party.payments.incentives[0].value.maximum_amount, 20);
  assert.equal(records[0].first_party.access.parking.cost.value, 'free');
  assert.equal(records[0].first_party.policies.find((item) => item.id === 'pet-policy').value.rule, 'service_animals_only');
  assert.deepEqual(records[0].first_party.products.categories.map((item) => item.value.code), ['fresh_produce', 'eggs', 'baked_goods', 'flowers', 'honey']);
  assert.doesNotThrow(() => validateRichEnrichment(records[0], 'record', (message) => { throw new Error(message); }));
});

test('requires a source-explicit IANA timezone before promoting market hours', () => {
  const withoutTimezone = promote({ result: { evidence: [
    { kind: 'schedule', excerpt: 'Saturdays, 9:00am - 1:00pm.' },
  ] } });
  assert.equal(withoutTimezone.records.length, 0);
  assert.equal(withoutTimezone.dispositions.no_promotable_market_scoped_facts, 1);

  const withTimezone = promote({ result: { evidence: [
    { kind: 'schedule', excerpt: 'Saturdays, 9:00am - 1:00pm, America/Los_Angeles.' },
  ] } });
  const operations = withTimezone.records[0].first_party.operations;
  assert.equal(operations.timezone.value, 'America/Los_Angeles');
  assert.deepEqual(operations.schedules[0].value, {
    recurrence: { kind: 'weekly', weekdays: ['saturday'] }, opens: '09:00', closes: '13:00',
  });
});

test('rejects shared and umbrella pages even when the audit identity flag is true', () => {
  const shared = promote({ target: { linked_markets: 2, risk_class: 'shared_page_multiple_identities', row_keys: ['legacy:1:riverside-farmers-market-riverside', 'legacy:2:uptown-market'] } });
  assert.equal(shared.records.length, 0);
  assert.equal(shared.dispositions.shared_or_umbrella_target, 1);

  const umbrella = promote({ result: { headings: ['Our Market Locations'], evidence: [{ kind: 'payment', excerpt: 'The market accepts cash.' }] } });
  assert.equal(umbrella.records.length, 0);
  assert.equal(umbrella.dispositions.umbrella_page_surface, 1);
});

test('rejects footer, sibling-market, vendor, and event leakage', () => {
  const { records, dispositions } = promote({ result: { evidence: [
    { kind: 'payment', excerpt: 'Copyright 2026. All our markets accept SNAP.' },
    { kind: 'schedule', excerpt: 'Uptown Farmers Market: Saturdays, 9:00am - 1:00pm, America/Los_Angeles.' },
    { kind: 'schedule', excerpt: 'Vendor check-in is Saturdays, 7:00am - 8:00am, America/Los_Angeles.' },
    { kind: 'schedule', excerpt: 'Live music Saturday, 10:00am - 12:00pm, America/Los_Angeles.' },
    { kind: 'payment', excerpt: 'A few of our vendors accept credit and debit cards.' },
    { kind: 'assistance', excerpt: 'At this time, we do not accept EBT at the market.' },
    { kind: 'vendors', excerpt: '2026 Vendor Applications are now open.' },
    { kind: 'pets', excerpt: 'Is the market dog-friendly?' },
    { kind: 'weather', excerpt: 'Most farmers markets operate rain or shine.' },
    { kind: 'products', excerpt: 'Featured vendor Acme Farm sells eggs, honey, and flowers.' },
    { kind: 'amenities', excerpt: '9) Are there any public restrooms available at the market?' },
  ] } });
  assert.equal(records.length, 0);
  assert.equal(dispositions.no_promotable_market_scoped_facts, 1);
});

test('keeps visitor FAQ content but removes vendor setup instructions and scopes vendor-area pet restrictions', () => {
  const { records } = promote({ result: { evidence: [
    {
      kind: 'faq',
      excerpt: 'Q: When is the market open? A: We are open Sundays from 8:00 AM-2:00 PM. Vendors are permitted to set up from 6:30 AM-7:30 AM.',
    },
    {
      kind: 'pets',
      excerpt: 'No pets are allowed in the vendor selling area, except for certified service animals.',
    },
  ] } });

  assert.equal(records[0].first_party.faq_facts[0].value.answer, 'We are open Sundays from 8:00 AM-2:00 PM.');
  assert.equal(records[0].first_party.policies[0].value.rule, 'conditional');
});

test('prefers detail evidence and only promotes exact base-page social and newsletter links', () => {
  const base = fixture();
  const { records } = promote({
    result: { evidence: [{ kind: 'payment', excerpt: 'The market accepts cash.' }] },
    details: [{
      target_id: base.targets[0].target_id,
      matched_row_keys: [base.rows[0].row_key],
      disposition: 'detail_audited',
      pages: [
        {
          url: 'https://riversidemarket.example/visit',
          title: 'Riverside Farmers Market | Visitor Information',
          h1: ['Riverside Farmers Market'],
          evidence: [
            { kind: 'parking', excerpt: 'Free parking is available beside the market.' },
            { kind: 'assistance', excerpt: 'The market does not accept EBT.' },
          ],
          social_profiles: [
            'https://instagram.com/riversidefarmersmarket',
            'https://facebook.com/riversideparksdepartment',
          ],
          newsletter_urls: ['https://riversidemarket.example/newsletter/subscribe'],
        },
        {
          url: 'https://riversidemarket.example/vendors',
          title: 'Vendor directory | Riverside Farmers Market',
          h1: ['Vendor directory'],
          evidence: [
            { kind: 'schedule', excerpt: 'Vendor check-in Saturdays, 7:00am - 8:00am, America/Los_Angeles.' },
            { kind: 'products', excerpt: 'Featured vendor Acme Farm sells eggs and honey.' },
          ],
          social_profiles: ['https://instagram.com/acmefarm'],
          newsletter_urls: [],
        },
      ],
    }],
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].first_party.payments, undefined);
  assert.equal(records[0].first_party.operations, undefined);
  assert.equal(records[0].first_party.products, undefined);
  assert.equal(records[0].first_party.access.parking.cost.value, 'free');
  assert.deepEqual(records[0].first_party.contact.social_profiles.map((item) => item.value.url), [
    'https://instagram.com/riversidefarmersmarket',
  ]);
  assert.equal(records[0].first_party.contact.newsletter.value.signup_url, 'https://riversidemarket.example/newsletter/subscribe');
  assert.deepEqual(records[0].sources.map((source) => source.url), ['https://riversidemarket.example/visit']);
});

test('promotes only dated market-hosted events and explicit market language support', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'programs', excerpt: 'The market hosts Harvest Festival on October 3, 2026.' },
    { kind: 'languages', excerpt: 'Market staff speak Spanish, and materials are available in Spanish and Vietnamese.' },
  ] } });
  assert.equal(records[0].first_party.events[0].value.name, 'Harvest Festival');
  assert.equal(records[0].first_party.events[0].value.start, '2026-10-03');
  assert.deepEqual(records[0].first_party.languages.spoken.map((item) => item.value.tag), ['es']);
  assert.deepEqual(records[0].first_party.languages.materials.map((item) => item.value.tag), ['es', 'vi']);
});

test('promotes FAQ only from an explicit question-and-answer evidence record', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'faq', excerpt: 'Q: Can I bring my dog? A: Service animals are welcome; other animals are not allowed.' },
    { kind: 'pets', excerpt: 'Can I bring my dog to the market?' },
  ] } });
  assert.deepEqual(records[0].first_party.faq_facts[0].value, {
    topic: 'pets', answer: 'Service animals are welcome; other animals are not allowed.',
  });
});

test('rejects semantically mismatched, vendor-facing, and navigation-only FAQs', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'faq', excerpt: 'Q: Is the market wheelchair accessible? A: Donate today to sustain Double Bucks.' },
    { kind: 'faq', excerpt: 'Q: Want to join our vendor community? A: FIND OUT HOW' },
    { kind: 'faq', excerpt: 'Q: Does the market accept credit cards? A: Farmers Market' },
    { kind: 'faq', excerpt: 'Q: Where can I park? A: Free parking is available beside the market.' },
  ] } });
  assert.equal(records[0].first_party.faq_facts.length, 1);
  assert.deepEqual(records[0].first_party.faq_facts[0].value, {
    topic: 'parking', answer: 'Free parking is available beside the market.',
  });
});

test('rejects vendor-only benefits, historical/capacity counts, and expired parking', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'assistance', excerpt: 'Interested vendors can apply to accept SNAP benefits.' },
    { kind: 'assistance', excerpt: 'Some vendors accept WIC checks.' },
    { kind: 'vendors', excerpt: 'In 2024, the market featured 24 vendors.' },
    { kind: 'vendors', excerpt: 'The market has space for up to 200 vendors.' },
    { kind: 'parking', excerpt: 'Winter parking is free December 2025 through April 2026.' },
    { kind: 'parking', excerpt: 'Limited handicap parking is available in the market lot.' },
  ] } });
  assert.equal(records[0].first_party.payments, undefined);
  assert.equal(records[0].first_party.vendors, undefined);
  assert.equal(records[0].first_party.access.parking.availability.value, 'limited');
  assert.equal(records[0].first_party.access.parking.cost, undefined);
});

test('requires real visitor transit directions and does not treat benefit eligibility as inventory', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'transit', excerpt: 'Metro Microgreens - weekly' },
    { kind: 'transit', excerpt: 'Turn left at Ferry Street and continue to the market.' },
    { kind: 'transit', excerpt: 'The market is outside the Ferry Building.' },
    { kind: 'transit', excerpt: 'First Metro Bank sponsors music at the market.' },
    { kind: 'transit', excerpt: 'Parking and Public Transit' },
    { kind: 'transit', excerpt: 'Take bus route 4 to the stop directly in front of the market.' },
    { kind: 'transit', excerpt: 'The shuttle bus stops directly at the market entrance.' },
    { kind: 'products', excerpt: 'SNAP tokens can be used at the market for fruits, vegetables, and herb plants.' },
  ] } });
  assert.deepEqual(records[0].first_party.access.transit.map((item) => item.value.mode), ['bus', 'shuttle']);
  assert.equal(records[0].first_party.products, undefined);
});

test('classifies rainy-day FAQ as weather and rejects link-only or truncated answers', () => {
  const { records } = promote({ result: { evidence: [
    { kind: 'faq', excerpt: 'Q: Is the market open if it rains? A: Yes, the market remains open rain or shine.' },
    { kind: 'faq', excerpt: 'Q: Where do I park? A: See our Directions page for details.' },
    { kind: 'faq', excerpt: 'Q: Where is the market? A: We are located in the municipal lot near' },
  ] } });
  assert.deepEqual(records[0].first_party.faq_facts.map((item) => item.value), [
    { topic: 'weather', answer: 'Yes, the market remains open rain or shine.' },
  ]);
});

test('does not turn an isolated service-animal allowance into a service-animals-only policy', () => {
  const { records, dispositions } = promote({ result: { evidence: [
    { kind: 'pets', excerpt: 'Registered service animals are permitted.' },
  ] } });
  assert.equal(records.length, 0);
  assert.equal(dispositions.no_promotable_market_scoped_facts, 1);
});

test('rejects a generic or mismatched page identity surface', () => {
  const generic = promote({ result: { page_title: 'Home', h1: [], evidence: [{ kind: 'weather', excerpt: 'Open rain or shine.' }] } });
  assert.equal(generic.records.length, 0);
  assert.equal(generic.dispositions.weak_identity_surface, 1);

  const wrongMarket = promote({ result: { page_title: 'Uptown Farmers Market', h1: [], evidence: [{ kind: 'weather', excerpt: 'Open rain or shine.' }] } });
  assert.equal(wrongMarket.records.length, 0);
  assert.equal(wrongMarket.dispositions.weak_identity_surface, 1);
});

test('rejects duplicate source market IDs to avoid ambiguous build-time merges', () => {
  const input = fixture({ result: { evidence: [{ kind: 'weather', excerpt: 'Open rain or shine.' }] } });
  input.rows.push({ ...input.rows[0], row_key: 'government:1:other-market', market_name: 'Other Market' });
  const promoted = promoteWebsiteAudit(input);
  assert.equal(promoted.records.length, 0);
  assert.equal(promoted.dispositions.duplicate_market_id, 1);
});
