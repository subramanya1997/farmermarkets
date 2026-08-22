import assert from 'node:assert/strict';
import test from 'node:test';

const facts = await import('./marketFacts.ts');

const {
  amenityLabels,
  composedSummary,
  descriptionParagraphs,
  formatDate,
  formatMiles,
  marketFacts,
  orderingLabels,
  paymentLabels,
  productLabels,
  productionLabels,
  settingLabel,
  siteTypeLabel,
  socialLinks,
  structuredScheduleLabels,
  telHref,
} = facts;

type Market = Parameters<typeof marketFacts>[0];

const market = (overrides: Partial<Market> = {}): Market =>
  ({ name: 'Durham Farmers Market', ...overrides }) as Market;

/* ------------------------------------------------------------------ *
 * Source prose
 * ------------------------------------------------------------------ */

test('description keeps paragraphs and drops the spreadsheet escapes', () => {
  const raw =
    'Come find the freshest produce._x000d_\n_x000d_\nTime:  Wednesdays   3-6pm._x000d_\n';
  assert.deepEqual(descriptionParagraphs(raw), [
    'Come find the freshest produce.',
    'Time: Wednesdays 3-6pm.',
  ]);
});

test('an absent description is empty, never a blank paragraph', () => {
  for (const value of [undefined, null, '', '   ', '\n\n']) {
    assert.deepEqual(descriptionParagraphs(value), []);
  }
});

/* ------------------------------------------------------------------ *
 * Enumerations
 * ------------------------------------------------------------------ */

test('every indoor_outdoor spelling in the data maps to a readable setting', () => {
  assert.equal(settingLabel('No Indoor;'), 'Outdoor');
  assert.equal(settingLabel('No;'), 'Outdoor');
  assert.equal(settingLabel('No'), 'Outdoor');
  assert.equal(settingLabel('Entire time the market is open indoor;'), 'Indoor');
  assert.equal(settingLabel('Yes, entire time the market is open indoor;'), 'Indoor');
  assert.equal(settingLabel('Part of the time the market is open indoor;'), 'Indoor and outdoor');
  assert.equal(
    settingLabel('Yes, part of the time the market is open indoor;'),
    'Indoor and outdoor'
  );
});

test('a setting the record does not know renders nothing', () => {
  for (const value of ['Unknown', '', undefined, null, 'perhaps']) {
    assert.equal(settingLabel(value), undefined);
  }
});

test('site type keeps the publisher wording, minus the trailing separator', () => {
  assert.equal(siteTypeLabel('Closed-off public street;'), 'Closed-off public street');
  assert.equal(siteTypeLabel('in a City park.'), 'In a City park');
  assert.equal(siteTypeLabel('To be determined'), undefined);
  assert.equal(siteTypeLabel('  '), undefined);
});

/* ------------------------------------------------------------------ *
 * Fact rows
 * ------------------------------------------------------------------ */

test('a record with nothing to say produces no fact rows at all', () => {
  assert.deepEqual(marketFacts(market()), []);
});

test('fact rows carry only the fields the record fills', () => {
  const rows = marketFacts(
    market({
      days: ['saturday'],
      season: 'Saturdays 8:00 AM to 1:00 PM',
      vendor_count: 24,
      indoor_outdoor: 'No Indoor;',
      snap: true,
      has_parking: true,
    })
  );

  const byTerm = new Map(rows.map((row) => [row.term, row.values]));
  assert.deepEqual(byTerm.get('Days'), ['Saturday']);
  assert.deepEqual(byTerm.get('Hours'), ['8am-1pm']);
  assert.deepEqual(byTerm.get('Vendors'), ['24']);
  assert.deepEqual(byTerm.get('Setting'), ['Outdoor']);
  assert.deepEqual(byTerm.get('Amenities'), ['Parking']);
  assert.deepEqual(byTerm.get('Payment'), ['SNAP/EBT']);
  assert.equal(byTerm.has('Sold here'), false);
  assert.equal(byTerm.has('Ordering'), false);
  // No row is ever emitted with an empty value list.
  for (const row of rows) assert.ok(row.values.length > 0, row.term);
});

test('day-specific time windows stay visible instead of collapsing to the first one', () => {
  const rows = marketFacts(
    market({
      days: ['Wednesday 8:00 AM-2:00 PM', 'Saturday 8:00 AM-1:00 PM'],
      season: 'Year-round',
      visitor_note: 'Holiday schedules can differ.',
    })
  );
  const byTerm = new Map(rows.map((row) => [row.term, row.values]));
  assert.deepEqual(byTerm.get('Schedule'), [
    'Wednesday 8:00 AM-2:00 PM',
    'Saturday 8:00 AM-1:00 PM',
  ]);
  assert.equal(byTerm.has('Days'), false);
  assert.equal(byTerm.has('Hours'), false);
  assert.deepEqual(byTerm.get('Season'), ['Year-round']);
  assert.deepEqual(byTerm.get('Before you go'), ['Holiday schedules can differ.']);
});

test('a zero vendor count is not a vendor count', () => {
  assert.equal(
    marketFacts(market({ vendor_count: 0 })).some((row) => row.term === 'Vendors'),
    false
  );
});

test('a program named twice, two ways, is printed once', () => {
  // The USDA export lists SFMNP as a payment method *and* sets the flag.
  assert.deepEqual(
    paymentLabels(
      market({ payment_methods: ['Cash', 'SNAP/EBT', 'SFMNP'], snap: true, sfmnp: true })
    ),
    ['Cash', 'SNAP/EBT', 'Senior Farmers Market Nutrition Program (SFMNP)']
  );
});

test('regional benefit names and combined vouchers normalize without duplicates', () => {
  assert.deepEqual(
    paymentLabels(
      market({
        payment_methods: ['CalFresh EBT', 'WIC and FMNP vouchers', 'Market Match'],
        snap: true,
        wic: true,
        fmnp: true,
      })
    ),
    ['SNAP/EBT', 'WIC', 'Farmers Market Nutrition Program (FMNP)', 'Market Match']
  );
});

test('a catch-all payment method tells the reader nothing and is dropped', () => {
  assert.deepEqual(paymentLabels(market({ payment_methods: ['Other', 'Venmo'] })), ['Venmo']);
});

test('production methods keep their certification wording', () => {
  assert.deepEqual(
    productionLabels(
      market({ production_methods: ['Organic (USDA Certified)', 'Grass-fed', 'grass-fed'] })
    ),
    ['Organic (USDA Certified)', 'Grass-fed']
  );
});

test('products fall back to the category flags, and stay empty when there are none', () => {
  assert.deepEqual(productLabels(market({ products: ['Peaches', 'Honey'] })), ['Peaches', 'Honey']);
  assert.deepEqual(productLabels(market({ has_fresh_produce: true, has_wine: true })), [
    'Fresh produce',
    'Wine',
  ]);
  assert.deepEqual(productLabels(market()), []);
});

test('the ordering note reads as a phrase, not a checkbox dump', () => {
  const [ordering] = marketFacts(
    market({
      delivery_available: true,
      delivery_methods: "Curbside pickup/on-site pickup;Delivery to customers' home;",
    })
  ).filter((row) => row.term === 'Ordering');

  assert.deepEqual(ordering.values, ['Delivery']);
  assert.equal(ordering.note, "Curbside pickup/on-site pickup, Delivery to customers' home");
});

test('amenity and ordering labels report only what is true', () => {
  assert.deepEqual(amenityLabels(market({ has_parking: true, has_restrooms: false })), ['Parking']);
  assert.deepEqual(orderingLabels(market({ csa_available: true, delivery_available: true })), [
    'CSA subscriptions',
    'Delivery',
  ]);
  assert.deepEqual(orderingLabels(market()), []);
});

test('rich visitor facts add logistics, policy, program and incentive rows', () => {
  const evidence = { source_ids: ['official-market-page'], verified_at: '2026-08-21' };
  const rows = marketFacts(market({
    first_party: {
      operations: {
        status: { value: { value: 'seasonal_break', note: 'Returns in June.' }, ...evidence },
      },
      payments: {
        incentives: [{
          id: 'double-up-food-bucks',
          value: { name: 'Double Up Food Bucks', kind: 'match' },
          ...evidence,
        }],
      },
      access: {
        transit: [{
          id: 'max-yellow-line',
          value: { mode: 'rail', routes: ['MAX Yellow Line'], stop_name: 'Kenton/N Denver' },
          ...evidence,
        }],
        parking: {
          availability: { value: 'yes', ...evidence },
          cost: { value: 'free', ...evidence },
        },
      },
      policies: [{
        id: 'pet-policy',
        value: { code: 'pets', rule: 'conditional', note: 'Keep pets away from food.' },
        ...evidence,
      }],
      programs: [{
        id: 'kids-activities',
        value: { name: 'Seasonal kids activities', kind: 'kids_club' },
        ...evidence,
      }],
    },
  }));

  const byTerm = new Map(rows.map((row) => [row.term, row]));
  assert.deepEqual(byTerm.get('Current status')?.values, ['Closed for the season']);
  assert.deepEqual(byTerm.get('Save with')?.values, ['Double Up Food Bucks']);
  assert.deepEqual(byTerm.get('Parking')?.values, ['Yes', 'Free']);
  assert.match(byTerm.get('Transit')?.values[0] ?? '', /MAX Yellow Line/);
  assert.match(byTerm.get('Visitor policies')?.values[0] ?? '', /Pets: Conditional/);
  assert.deepEqual(byTerm.get('Programs')?.values, ['Seasonal kids activities']);
});

test('representative v2 schedules and amenities render without collapsing or disappearing', () => {
  const evidence = { source_ids: ['ferry-plaza-visitor-info'], verified_at: '2026-08-21' };
  const first_party: NonNullable<Market['first_party']> = {
    operations: {
      season: { value: { kind: 'year_round' }, ...evidence },
      schedules: [
        {
          id: 'saturday',
          value: {
            recurrence: { kind: 'weekly', weekdays: ['saturday'] },
            opens: '08:00',
            closes: '14:00',
          },
          ...evidence,
        },
        {
          id: 'tuesday-thursday',
          value: {
            recurrence: { kind: 'weekly', weekdays: ['tuesday', 'thursday'] },
            opens: '10:00',
            closes: '14:00',
          },
          ...evidence,
        },
      ],
    },
    amenities: [
      {
        id: 'atm',
        value: { code: 'atm', availability: 'yes', note: 'ATMs are inside the Ferry Building.' },
        ...evidence,
      },
      {
        id: 'veggie-valet',
        value: { code: 'purchase_holding', availability: 'yes', note: 'The free Veggie Valet holds purchases.' },
        ...evidence,
      },
    ],
  };
  const record = market({
    name: 'Ferry Plaza Farmers Market',
    days: ['Saturday 08:00-14:00', 'Tuesday, Thursday 10:00-14:00'],
    season: 'Year-round',
    first_party,
  });

  assert.deepEqual(structuredScheduleLabels(first_party), [
    'Saturdays, 8am–2pm',
    'Tuesdays and Thursdays, 10am–2pm',
  ]);
  const byTerm = new Map(marketFacts(record).map((row) => [row.term, row.values]));
  assert.deepEqual(byTerm.get('Schedule'), [
    'Saturdays, 8am–2pm',
    'Tuesdays and Thursdays, 10am–2pm',
  ]);
  assert.deepEqual(byTerm.get('Amenities'), [
    'ATM - ATMs are inside the Ferry Building.',
    'Purchase holding - The free Veggie Valet holds purchases.',
  ]);
  assert.ok(
    composedSummary(record).includes(
      'Its schedule is Saturdays, 8am–2pm; Tuesdays and Thursdays, 10am–2pm, year-round.'
    )
  );
});

test('exact v2 payment methods take precedence and deduplicate legacy synonyms', () => {
  const evidence = { source_ids: ['official-page'], verified_at: '2026-08-21' };
  assert.deepEqual(paymentLabels(market({
    payment_methods: ['Credit cards', 'Contactless payments', 'Market coins', 'Credit/Debit'],
    accepts_credit_debit: true,
    first_party: {
      payments: {
        methods: [
          { id: 'credit', value: { code: 'credit_card' }, ...evidence },
          {
            id: 'contactless',
            value: { code: 'contactless', label: 'Contactless payments such as Apple Pay' },
            ...evidence,
          },
          {
            id: 'market-token',
            value: { code: 'market_token', label: 'Wooden market coins' },
            ...evidence,
          },
        ],
      },
    },
  })), ['Credit Card', 'Contactless payments such as Apple Pay', 'Wooden market coins']);
});

test('dated seasons keep the month capitalized in visit summaries', () => {
  const summary = composedSummary(market({
    days: ['Wednesday 15:00-19:00'],
    season: 'June 3-September 30, 2026',
  })).join(' ');
  assert.ok(summary.includes(', June 3-September 30, 2026.'));
});

/* ------------------------------------------------------------------ *
 * Contact links
 * ------------------------------------------------------------------ */

test('phone numbers become tel: targets only when they are dialable', () => {
  assert.equal(telHref('(919) 555-0134'), 'tel:9195550134');
  assert.equal(telHref('+32 2 555 01 34'), 'tel:+3225550134');
  assert.equal(telHref('ext. 12'), undefined);
  assert.equal(telHref('call the market office'), undefined);
  assert.equal(telHref(''), undefined);
});

test('social links resolve a URL or a named handle, and drop a bare one', () => {
  assert.deepEqual(socialLinks(['https://www.facebook.com/durhamfarmersmarket']), [
    { label: 'Facebook', href: 'https://www.facebook.com/durhamfarmersmarket' },
  ]);
  assert.deepEqual(socialLinks(['Instagram: @gateway_farmersmarket']), [
    { label: 'Instagram', href: 'https://instagram.com/gateway_farmersmarket' },
  ]);
  // No platform named, so there is no profile to link at.
  assert.deepEqual(socialLinks(['@farmersmarketsw', 'Rparkfm', 'not a url']), []);
});

/* ------------------------------------------------------------------ *
 * Dates and distances
 * ------------------------------------------------------------------ */

test('dates render from the record, and a non-date renders nothing', () => {
  assert.equal(formatDate('2020-08-03'), 'August 3, 2020');
  assert.equal(formatDate('2026-08-20T08:29:01.168Z'), 'August 20, 2026');
  assert.equal(formatDate('not a date'), undefined);
  assert.equal(formatDate(undefined), undefined);
});

test('distances read in miles at a sane precision', () => {
  assert.equal(formatMiles(1), '0.6 mi');
  assert.equal(formatMiles(30), '19 mi');
});

/* ------------------------------------------------------------------ *
 * Composed summary
 * ------------------------------------------------------------------ */

/** The summary must never expose a template slot or an unsupported claim. */
function assertWellFormed(sentences: string[]) {
  for (const sentence of sentences) {
    assert.doesNotMatch(sentence, /\s{2,}/, sentence);
    assert.doesNotMatch(sentence, /\s\./, sentence);
    assert.doesNotMatch(sentence, /\b(in|at|from|and)\s*\./i, sentence);
    assert.doesNotMatch(sentence, /undefined|NaN|null/, sentence);
    assert.match(sentence, /\.$/, sentence);
  }
}

test('the summary is built from the fields the record has', () => {
  const sentences = composedSummary(
    market({
      name: 'Durham Farmers Market',
      address: '501 Foster Street, Durham, North Carolina, 27701',
      city: 'Durham',
      state: 'North Carolina',
      days: ['saturday'],
      season: 'Saturdays 8:00 AM to 1:00 PM',
      vendor_count: 24,
      indoor_outdoor: 'No Indoor;',
      snap: true,
      wic: true,
    })
  );

  assertWellFormed(sentences);
  assert.equal(sentences[0], 'Durham Farmers Market is at 501 Foster St in Durham, NC.');
  assert.equal(sentences[1], 'It is open Saturdays from 8am-1pm.');
  assert.equal(sentences[2], '24 vendors are listed at this outdoor market.');
  assert.equal(sentences[3], 'It accepts SNAP/EBT and WIC.');
});

test('a name that does not say "market" gets the gloss, once', () => {
  const [first] = composedSummary(market({ name: 'Winter Bazaar', city: 'Boone', state: 'NC' }));
  assert.equal(first, 'Winter Bazaar, a farmers market, is in Boone, NC.');
});

test('a sparse record gets one honest sentence, not filler', () => {
  const sentences = composedSummary(market({ name: 'Ennis Farmers Market', city: 'Ennis', state: 'TX' }));
  assertWellFormed(sentences);
  assert.deepEqual(sentences, ['Ennis Farmers Market is in Ennis, TX.']);
});

test('a record with no location at all still says nothing false', () => {
  assertWellFormed(composedSummary(market({ name: 'Riverside Market' })));
  assertWellFormed(composedSummary(market({ name: 'Riverside Grocers' })));
});

test('the summary varies with the data rather than repeating a template', () => {
  const one = composedSummary(
    market({ name: 'A Market', city: 'Akron', state: 'OH', days: ['tuesday'] })
  ).join(' ');
  const two = composedSummary(
    market({ name: 'B Market', city: 'Boise', state: 'ID', season: 'Year Round', snap: true })
  ).join(' ');
  assert.notEqual(one, two);
});
