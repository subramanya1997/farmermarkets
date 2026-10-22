import assert from 'node:assert/strict';
import test from 'node:test';

const { planVisitSummary, planVisitCoveredTerms, compactScheduleLines, upcomingExceptions } = await import('./planVisit.ts');
const { computeOpenStatus, openStatusInput } = await import('./openStatus.ts');
const { MARKET_ALIASES, marketAlias } = await import('./marketAliases.ts');
const { marketTitle, marketDescription, TITLE_MAX_LENGTH } = await import('./seo.ts');

type Market = Parameters<typeof planVisitSummary>[0];
const evidence = { source_ids: ['official'], verified_at: '2026-10-21' };

const findlay = {
  name: 'Findlay Market',
  address: '1801 Race Street, Cincinnati, OH, USA',
  city: 'Cincinnati',
  state: 'Ohio',
  snap: true,
  first_party: {
    operations: {
      timezone: { value: 'America/New_York', ...evidence },
      season: { value: { kind: 'year_round' }, ...evidence },
      schedules: [
        { id: 'weekdays', value: { label: 'market house and shops', recurrence: { kind: 'weekly', weekdays: ['tuesday', 'wednesday', 'thursday', 'friday'] }, opens: '09:00', closes: '18:00' }, ...evidence },
        { id: 'sat', value: { label: 'market house and shops', recurrence: { kind: 'weekly', weekdays: ['saturday'] }, opens: '08:00', closes: '18:00' }, ...evidence },
        { id: 'shed-sat', value: { label: 'Farm Shed farmers market', recurrence: { kind: 'weekly', weekdays: ['saturday'] }, opens: '08:00', closes: '14:00' }, ...evidence },
      ],
      exceptions: [
        { id: 'past', value: { start_date: '2026-10-01', status: 'closed', note: 'Past' }, ...evidence },
        { id: 'thanksgiving', value: { start_date: '2026-11-26', status: 'closed', note: 'Thanksgiving' }, ...evidence },
        { id: 'monday', value: { start_date: '2026-11-23', status: 'special_opening', opens: '09:00', closes: '15:00' }, ...evidence },
      ],
    },
    access: {
      parking: {
        availability: { value: 'yes', ...evidence },
        cost: { value: 'paid', ...evidence },
        location_note: { value: 'Two lots at $3 an hour', ...evidence },
      },
    },
    payments: {
      assistance: [{ id: 'snap', value: { code: 'snap_ebt', redemption_instructions: 'Get tokens at the Market Center' }, ...evidence }],
      incentives: [{ id: 'perks', value: { name: 'Produce Perks', kind: 'match', input_amount: 1, benefit_amount: 1, maximum_amount: 25 }, ...evidence }],
    },
    vendors: {
      count: { value: { value: 50, qualifier: 'more than' }, ...evidence },
      directory_url: { value: 'https://www.findlaymarket.org/merchants', ...evidence },
    },
  },
} as unknown as Market;

test('a well-documented market gets a compact, grouped summary', () => {
  const rows = planVisitSummary(findlay, '2026-10-21');
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.items.map((item) => item.text)]));
  assert.deepEqual(byKey.when, [
    'Market house and shops: Tue-Fri 9am-6pm, Sat 8am-6pm',
    'Farm Shed farmers market: Sat 8am-2pm',
    'Open year-round',
    'Nov 23: open 9am-3pm',
    'Closed Nov 26 (Thanksgiving)',
  ]);
  assert.deepEqual(byKey['getting-there'], ['Paid parking. Two lots at $3 an hour.']);
  // The how-to line names SNAP, so the plain method list does not repeat it.
  assert.deepEqual(byKey.paying, ['SNAP/EBT: Get tokens at the Market Center.', 'Produce Perks: $1 extra for every $1, up to $25 a day']);
  assert.deepEqual(byKey.vendors, ['More than 50 vendors', 'Vendor directory']);
  assert.equal(rows.find((row) => row.key === 'vendors')?.items[1].href, 'https://www.findlaymarket.org/merchants');
  const covered = planVisitCoveredTerms(rows);
  assert.ok(covered.has('Schedule') && covered.has('Parking') && covered.has('Payment'));
  for (const row of rows) for (const item of row.items) assert.doesNotMatch(item.text, /[–—]|unknown|undefined/i);
});

test('thin records get no summary at all, never empty rows', () => {
  assert.deepEqual(planVisitSummary({ name: 'Tiny Market', days: ['Saturday'], snap: true } as Market, '2026-10-21'), []);
  // First-party facts that answer only one question do not earn a summary.
  assert.deepEqual(planVisitSummary({
    name: 'Events Only Market',
    first_party: { events: [{ id: 'e', value: { name: 'Fair', kind: 'festival' }, ...evidence }] },
  } as unknown as Market, '2026-10-21'), []);
});

test('expired exceptions drop out and at most three are listed', () => {
  const lines = upcomingExceptions(findlay.first_party, '2026-11-24');
  assert.deepEqual(lines, ['Closed Nov 26 (Thanksgiving)']);
});

test('dated schedules keep their full labels', () => {
  const lines = compactScheduleLines({
    operations: {
      schedules: [{ id: 'x', value: { recurrence: { kind: 'weekly', weekdays: ['thursday'] }, opens: '15:00', closes: '19:00', start_date: '2026-05-07', end_date: '2026-08-27' }, ...evidence }],
    },
  } as never);
  assert.deepEqual(lines, ['Thursdays, 3pm-7pm (May 7, 2026 - August 27, 2026)']);
});

test('open status is computed in the market timezone, with exceptions', () => {
  const input = openStatusInput(findlay.first_party);
  assert.ok(input);
  // Tuesday 2026-10-20 15:00 in Cincinnati (19:00 UTC).
  assert.deepEqual(computeOpenStatus(input, new Date('2026-10-20T19:00:00Z')), { open: true, text: 'Open now until 6pm' });
  // Monday 2026-10-19 12:00 local: closed, opens tomorrow.
  assert.deepEqual(computeOpenStatus(input, new Date('2026-10-19T16:00:00Z')), { open: false, text: 'Closed now, opens tomorrow at 9am' });
  // Saturday 7:00 local: the wider window wins, and the opening time is the earliest.
  assert.deepEqual(computeOpenStatus(input, new Date('2026-10-24T11:00:00Z')), { open: false, text: 'Closed now, opens today at 8am' });
  // Thanksgiving Thursday is closed; the next opening is Friday.
  assert.deepEqual(computeOpenStatus(input, new Date('2026-11-26T15:00:00Z')), { open: false, text: 'Closed now, opens tomorrow at 9am' });
  // Monday before Thanksgiving is a special opening.
  assert.deepEqual(computeOpenStatus(input, new Date('2026-11-23T15:00:00Z')), { open: true, text: 'Open now until 3pm' });
});

test('open status is withheld when the record cannot support it', () => {
  assert.equal(openStatusInput(undefined), undefined);
  const seasonal = { operations: { ...findlay.first_party!.operations, season: { value: { kind: 'annual_range', start: { month: 5 }, end: { month: 10 } }, ...evidence } } };
  assert.equal(openStatusInput(seasonal as never), undefined);
  const noZone = { operations: { ...findlay.first_party!.operations, timezone: undefined } };
  assert.equal(openStatusInput(noZone as never), undefined);
});

test('flagship titles front-load the name and fit the SERP', () => {
  const title = marketTitle(findlay as never);
  assert.equal(title, 'Findlay Market - Cincinnati, OH: Hours, Parking & Vendors');
  assert.ok(title.length <= TITLE_MAX_LENGTH);
  // Too long for every topic: the tail is trimmed, the name and place stay.
  const long = marketTitle({ ...findlay, name: 'Soulard Farmers’ Market', city: 'St. Louis', state: 'Missouri' } as never);
  assert.equal(long, 'Soulard Farmers’ Market - St. Louis, MO: Hours & Parking');
  // A thin record keeps the old shape.
  assert.equal(marketTitle({ name: 'Tiny Market', city: 'Durham', state: 'NC' } as never), 'Tiny Market - Durham, NC');
  const description = marketDescription(findlay as never);
  assert.match(description, /Open Tue-Fri 9am-6pm, Sat 8am-6pm, year-round/);
  assert.doesNotMatch(description, /[–—]/);
});

test('JSON-LD carries upcoming closures and keeps the wider of nested windows', async () => {
  const { marketSchemaGraph } = await import('./schema.ts');
  const graph = marketSchemaGraph({ ...findlay, slug: 'findlay-market-oh' } as never, {
    siteUrl: 'https://www.farmermarkets.app',
    imageUrl: 'https://www.farmermarkets.app/x.png',
    now: new Date('2026-10-21T12:00:00Z'),
  });
  const business = (graph['@graph'] as Record<string, unknown>[])[0];
  assert.deepEqual(business.specialOpeningHoursSpecification, [
    { '@type': 'OpeningHoursSpecification', opens: '09:00', closes: '15:00', validFrom: '2026-11-23', validThrough: '2026-11-23' },
    { '@type': 'OpeningHoursSpecification', opens: '00:00', closes: '00:00', validFrom: '2026-11-26', validThrough: '2026-11-26' },
  ]);
  // The Farm Shed's Saturday 8am-2pm sits inside the market's 8am-6pm.
  const saturday = (business.openingHoursSpecification as { dayOfWeek: string[]; opens: string; closes: string }[])
    .filter((spec) => spec.dayOfWeek.includes('Saturday'));
  assert.deepEqual(saturday.map((spec) => `${spec.opens}-${spec.closes}`), ['08:00-18:00']);
});

test('aliases point at a different, existing-looking main listing', () => {
  for (const [id, alias] of Object.entries(MARKET_ALIASES)) {
    assert.notEqual(id, alias.canonicalId);
    assert.equal(marketAlias(alias.canonicalId), undefined, `${alias.canonicalId} is itself an alias`);
  }
  // Eastern Market in Washington, DC is a different market, never an alias.
  assert.equal(marketAlias('311218'), undefined);
});

const { planVisitView } = await import('./planVisitView.ts');

test('the card covers amenities, the visitor note and the legacy setting', () => {
  const covered = planVisitCoveredTerms(planVisitSummary(findlay, '2026-10-21'));
  for (const term of ['Amenities', 'Before you go', 'Setting']) assert.ok(covered.has(term), term);
  assert.equal(planVisitCoveredTerms([]).size, 0);
});

test('the grid holds the main schedule; a second labelled one is a single line', () => {
  const view = planVisitView(findlay, '2026-10-21');
  assert.equal(view.week?.length, 1);
  assert.equal(view.week?.[0].label, 'market house and shops');
  assert.deepEqual(view.otherSchedules, ['Farm Shed farmers market: Sat 8am-2pm']);
});

test('details are labelled by program, skip what a chip says, and take the directions', () => {
  const market = {
    ...findlay,
    first_party: {
      ...findlay.first_party,
      operations: { ...findlay.first_party!.operations, weather_policy: { value: 'The market operates year-round, rain or shine.', ...evidence } },
      payments: {
        assistance: [
          { id: 'wic', value: { code: 'wic', redemption_instructions: 'Redeem WIC vouchers at participating stalls.' }, ...evidence },
          { id: 'fmnp', value: { code: 'fmnp', redemption_instructions: 'Redeem FMNP vouchers at participating stalls.' }, ...evidence },
        ],
        incentives: [{ id: 'match', value: { name: 'Market Match', kind: 'match', note: 'The page states that CalFresh shoppers can double benefits.' }, ...evidence }],
      },
      policies: [
        { id: 'pets', value: { code: 'pets', rule: 'service_animals_only', note: 'Dogs are not allowed in the market except service animals.' }, ...evidence },
        { id: 'smoke', value: { code: 'smoking', rule: 'not_allowed', note: 'No smoking or vaping near vendor stalls.' }, ...evidence },
      ],
      amenities: [{ id: 'info', value: { code: 'information_booth', availability: 'yes', note: 'The red booth by the Farm Shed.' }, ...evidence }],
    },
  } as unknown as Market;
  const view = planVisitView(market, '2026-10-21', { directions: ['From Central Parkway turn east on Findlay St.'] });
  const terms = view.details.map((line) => `${line.term}: ${line.text}`);
  assert.ok(terms.includes('WIC: Redeem WIC vouchers at participating stalls.'));
  assert.ok(terms.includes('FMNP: Redeem FMNP vouchers at participating stalls.'));
  assert.ok(terms.includes('Market Match: CalFresh shoppers can double benefits.'));
  assert.ok(terms.includes('Directions: From Central Parkway turn east on Findlay St.'));
  assert.ok(terms.includes('Info booth: The red booth by the Farm Shed.'));
  assert.ok(terms.includes('Smoking: No smoking or vaping near vendor stalls.'));
  assert.equal(terms.some((line) => line.startsWith('SNAP/EBT') || line.startsWith('Pets') || line.startsWith('Weather')), false);
  assert.ok(view.rules.some((chip) => chip.label === 'Service animals only'));
});

test('chips shorten a program to its abbreviation and the vendor tile carries both links', () => {
  const market = {
    ...findlay,
    fmnp: true,
    first_party: {
      ...findlay.first_party,
      vendors: {
        ...findlay.first_party!.vendors,
        weekly_roster_url: { value: 'https://maps.example.com/8070', ...evidence },
      },
    },
  } as unknown as Market;
  const view = planVisitView(market, '2026-10-21');
  assert.ok(view.pay.some((chip) => chip.label === 'FMNP'));
  const vendors = view.tiles.find((tile) => tile.key === 'vendors');
  assert.equal(vendors?.href, 'https://www.findlaymarket.org/merchants');
  assert.equal(vendors?.extraHref, 'https://maps.example.com/8070');
});
