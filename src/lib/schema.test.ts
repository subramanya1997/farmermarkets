import assert from 'node:assert/strict';
import test from 'node:test';

const schema = await import('./schema.ts');

const {
  parseHourRange,
  parseSeasonRange,
  marketOpeningHoursSpec,
  marketPaymentAccepted,
  marketAddress,
  marketSameAs,
  marketDateModified,
  marketFaqs,
  marketSchemaGraph,
  prune,
} = schema;

type Market = Parameters<typeof marketSchemaGraph>[0];

const OPTIONS = {
  siteUrl: 'https://www.farmermarkets.app',
  imageUrl: 'https://www.farmermarkets.app/markets/x/opengraph-image',
  // Fixed so season years never depend on the day the suite runs.
  now: new Date('2026-08-21T00:00:00Z'),
};

function market(overrides: Partial<Market> = {}): Market {
  return { slug: 'test-market', name: 'Test Farmers Market', ...overrides } as Market;
}

/** Walk a JSON tree and fail on anything empty. This is the acceptance test. */
function assertNoEmptyValues(value: unknown, path = '$'): void {
  if (value === null || value === undefined) {
    assert.fail(`empty value at ${path}`);
  }
  if (typeof value === 'string') {
    assert.notEqual(value.trim(), '', `empty string at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    assert.ok(value.length > 0, `empty array at ${path}`);
    value.forEach((item, index) => assertNoEmptyValues(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    assert.ok(entries.length > 0, `empty object at ${path}`);
    const meaningful = entries.filter(
      ([key]) => !key.startsWith('@') || key === '@id' || key === '@graph'
    );
    assert.ok(meaningful.length > 0, `keyword-only node at ${path}`);
    for (const [key, item] of entries) assertNoEmptyValues(item, `${path}.${key}`);
  }
}

/* ------------------------------------------------------------------ *
 * Hours - the real formats in the two datasets
 * ------------------------------------------------------------------ */

test('parses the clock formats the datasets actually ship', () => {
  assert.deepEqual(parseHourRange('Saturday 09:00 AM - 01:00 PM'), { opens: '09:00', closes: '13:00' });
  assert.deepEqual(parseHourRange('Sat 9am-1pm'), { opens: '09:00', closes: '13:00' });
  assert.deepEqual(parseHourRange('Saturdays 8am to 1pm'), { opens: '08:00', closes: '13:00' });
  assert.deepEqual(parseHourRange('Samedi Sa 06:00-13:30'), { opens: '06:00', closes: '13:30' });
  assert.deepEqual(parseHourRange('Saturday 07h30 - 13h30'), { opens: '07:30', closes: '13:30' });
  assert.deepEqual(parseHourRange('6:00 a.m. to 8:00 p.m.'), { opens: '06:00', closes: '20:00' });
  assert.deepEqual(parseHourRange('Dimanche Su 06:00-14:00'), { opens: '06:00', closes: '14:00' });
  assert.deepEqual(parseHourRange('08:30:00 - 12:00:00'), { opens: '08:30', closes: '12:00' });
  assert.deepEqual(parseHourRange('Monday to Sunday 9am to 5pm'), { opens: '09:00', closes: '17:00' });
});

test('borrows a missing meridiem from the other end of the range', () => {
  assert.deepEqual(parseHourRange('9-1pm'), { opens: '09:00', closes: '13:00' });
  assert.deepEqual(parseHourRange('1-5pm'), { opens: '13:00', closes: '17:00' });
  assert.deepEqual(parseHourRange('9am-1'), { opens: '09:00', closes: '13:00' });
});

test('refuses to read a date span or an ambiguous number pair as times', () => {
  assert.equal(parseHourRange('June 1-October 31'), undefined);
  assert.equal(parseHourRange('July 1-October 31'), undefined);
  assert.equal(parseHourRange('May 2-October 31'), undefined);
  assert.equal(parseHourRange('summer, spring, fall'), undefined);
  assert.equal(parseHourRange('saturday'), undefined);
  assert.equal(parseHourRange('Year Round'), undefined);
  assert.equal(parseHourRange(''), undefined);
  assert.equal(parseHourRange(undefined), undefined);
  // Wraps past midnight - not expressible as one specification.
  assert.equal(parseHourRange('6:00 a.m. to 2:00 a.m.'), undefined);
});

/* ------------------------------------------------------------------ *
 * Seasons
 * ------------------------------------------------------------------ */

test('maps month ranges to ISO dates in the current or next season year', () => {
  const now = new Date('2026-03-01T00:00:00Z');
  assert.deepEqual(parseSeasonRange('May-Oct', now), {
    validFrom: '2026-05-01',
    validThrough: '2026-10-31',
  });
  assert.deepEqual(parseSeasonRange('May - November', now), {
    validFrom: '2026-05-01',
    validThrough: '2026-11-30',
  });
  assert.deepEqual(parseSeasonRange('June 1-October 31', now), {
    validFrom: '2026-06-01',
    validThrough: '2026-10-31',
  });
  assert.deepEqual(parseSeasonRange('Jun-Sept', now), {
    validFrom: '2026-06-01',
    validThrough: '2026-09-30',
  });
  assert.deepEqual(parseSeasonRange('April 5-December 20', now), {
    validFrom: '2026-04-05',
    validThrough: '2026-12-20',
  });
});

test('a season that runs backwards through the calendar crosses the year', () => {
  assert.deepEqual(parseSeasonRange('November-April', new Date('2026-03-01T00:00:00Z')), {
    validFrom: '2026-11-01',
    validThrough: '2027-04-30',
  });
});

test('a season that already ended this year resolves to next year', () => {
  // Asked in December, "May-Oct" is next May, not one that closed six weeks ago.
  assert.deepEqual(parseSeasonRange('May-Oct', new Date('2026-12-15T00:00:00Z')), {
    validFrom: '2027-05-01',
    validThrough: '2027-10-31',
  });
});

test('leaves seasons that are not date ranges alone', () => {
  for (const value of ['Year Round', 'year-round', 'summer, fall', 'Saturdays 8am to 1pm', '', null]) {
    assert.equal(parseSeasonRange(value, OPTIONS.now), undefined, `parsed ${value}`);
  }
});

/* ------------------------------------------------------------------ *
 * OpeningHoursSpecification
 * ------------------------------------------------------------------ */

test('builds a day + time specification from a full record', () => {
  const spec = marketOpeningHoursSpec(
    market({ days: ['Saturday 09:00 AM - 01:00 PM'], season: 'May-Oct' }),
    OPTIONS.now
  );
  assert.deepEqual(spec, [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday'],
      opens: '09:00',
      closes: '13:00',
      validFrom: '2026-05-01',
      validThrough: '2026-10-31',
    },
  ]);
});

test('a record that only names its days gets a dayOfWeek-only specification', () => {
  const spec = marketOpeningHoursSpec(market({ days: ['saturday', 'sunday'] }), OPTIONS.now);
  assert.deepEqual(spec, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday', 'Sunday'] },
  ]);
  assert.ok(spec && !('opens' in spec[0]), 'no opens key when no time is known');
});

test('reads French and Dutch day names, one specification per window', () => {
  const spec = marketOpeningHoursSpec(
    market({ days: ['Samedi Sa 06:00-13:30', 'Mercredi We 06:00-13:00', 'Zondag 06:00-13:30'] }),
    OPTIONS.now
  );
  assert.deepEqual(spec, [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday', 'Sunday'],
      opens: '06:00',
      closes: '13:30',
    },
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Wednesday'],
      opens: '06:00',
      closes: '13:00',
    },
  ]);
});

test('pairs days in one field with times in another', () => {
  const spec = marketOpeningHoursSpec(
    market({ days: ['saturday', '9:00 AM - 1:00 PM'] }),
    OPTIONS.now
  );
  assert.deepEqual(spec, [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday'],
      opens: '09:00',
      closes: '13:00',
    },
  ]);
});

test('omits opening hours entirely when nothing parses', () => {
  assert.equal(marketOpeningHoursSpec(market(), OPTIONS.now), undefined);
  assert.equal(
    marketOpeningHoursSpec(market({ season: 'summer, spring, fall' }), OPTIONS.now),
    undefined
  );
  assert.equal(
    marketOpeningHoursSpec(market({ days: ['6:00 a.m. to 8:00 p.m.'] }), OPTIONS.now),
    undefined
  );
});

/* ------------------------------------------------------------------ *
 * Payment, address, contact
 * ------------------------------------------------------------------ */

test('paymentAccepted comes from the flags, never from a default', () => {
  assert.equal(marketPaymentAccepted(market()), undefined);
  assert.deepEqual(marketPaymentAccepted(market({ snap: true })), ['SNAP/EBT']);
  assert.deepEqual(
    marketPaymentAccepted(
      market({
        accepts_cash: true,
        accepts_credit_debit: true,
        accepts_checks: true,
        snap: true,
        wic: true,
        sfmnp: true,
        fmnp: true,
      })
    ),
    ['Cash', 'Credit Card', 'Debit Card', 'Check', 'SNAP/EBT', 'WIC', 'SFMNP', 'FMNP']
  );
});

test('streetAddress is the street only, with the packed tail removed', () => {
  assert.deepEqual(
    marketAddress(
      market({
        address: '501 Foster Street, Durham, North Carolina, 27701',
        city: 'Durham',
        state: 'North Carolina',
        zip_code: '27701',
        country_code: 'US',
      })
    ),
    {
      '@type': 'PostalAddress',
      streetAddress: '501 Foster St',
      addressLocality: 'Durham',
      addressRegion: 'NC',
      postalCode: '27701',
      addressCountry: 'US',
    }
  );
});

test('an address with nothing in it is omitted, not emitted empty', () => {
  assert.equal(marketAddress(market()), undefined);
  assert.equal(marketAddress(market({ address: '', city: '', state: '' })), undefined);
  // Country alone locates nothing worth a node.
  assert.equal(marketAddress(market({ country_code: 'US' })), undefined);
});

test('sameAs keeps absolute URLs and drops bare social handles', () => {
  assert.deepEqual(
    marketSameAs(
      market({
        websites: ['https://example.org/market', ''],
        social_media: ['@farmersmarketsw', 'Rparkfm', 'https://www.facebook.com/example'],
      })
    ),
    ['https://example.org/market', 'https://www.facebook.com/example']
  );
  assert.equal(marketSameAs(market()), undefined);
  assert.equal(marketSameAs(market({ social_media: ['@handle'] })), undefined);
});

test('dateModified is an ISO date, or nothing', () => {
  assert.equal(marketDateModified(market({ last_updated: '2020-08-03T13:44:04' })), '2020-08-03');
  assert.equal(marketDateModified(market({ last_updated: 'not a date' })), undefined);
  assert.equal(marketDateModified(market()), undefined);
});

/* ------------------------------------------------------------------ *
 * FAQs
 * ------------------------------------------------------------------ */

const RICH: Partial<Market> = {
  slug: 'brighton-farmers-market',
  name: 'Brighton Farmers Market',
  address: '1150 Winton Road South, Rochester, New York, 14618',
  city: 'Rochester',
  state: 'New York',
  zip_code: '14618',
  country_code: 'US',
  location: { lat: 43.1281, lon: -77.5711 },
  days: ['Sunday 09:00 AM - 01:00 PM'],
  season: 'May-Oct',
  phone_numbers: ['585-555-0100'],
  emails: ['info@example.org'],
  websites: ['https://example.org/brighton'],
  social_media: ['https://www.facebook.com/brighton'],
  last_updated: '2020-08-03T13:44:04',
  accepts_cash: true,
  accepts_credit_debit: true,
  snap: true,
  wic: true,
};

test('asks only the questions the record can answer', () => {
  const faqs = marketFaqs(market(RICH));
  assert.deepEqual(faqs.map((faq) => faq.question), [
    'What days is Brighton Farmers Market open?',
    "What are Brighton Farmers Market's hours?",
    'Where is Brighton Farmers Market located?',
    'Does Brighton Farmers Market accept SNAP/EBT?',
    'What payment methods does Brighton Farmers Market accept?',
  ]);
  assert.equal(
    faqs[0].answer,
    'Brighton Farmers Market is open on Sundays. The season runs May-Oct.'
  );
  assert.equal(faqs[2].answer, 'Brighton Farmers Market is located at 1150 Winton Road South, Rochester, NY 14618.');
  assert.equal(faqs[3].answer, 'Yes. Brighton Farmers Market accepts SNAP/EBT benefits.');
});

test('a record with fewer than two answerable questions renders no FAQ block', () => {
  assert.deepEqual(marketFaqs(market()), []);
  // Address alone is one question.
  assert.deepEqual(marketFaqs(market({ address: '1 Main St', city: 'Ames', state: 'IA' })).length, 1 - 1);
});

test('SNAP is answered honestly when other payment data exists but SNAP is absent', () => {
  const faqs = marketFaqs(market({ ...RICH, snap: false }));
  const snap = faqs.find((faq) => faq.question.includes('SNAP'));
  assert.ok(snap);
  assert.match(snap.answer, /not listed among the payment options/);
});

test('a market with no payment data at all is not asked about SNAP', () => {
  const faqs = marketFaqs(
    market({ address: '1 Main St', city: 'Ames', state: 'IA', days: ['saturday'] })
  );
  assert.equal(faqs.some((faq) => faq.question.includes('SNAP')), false);
});

/* ------------------------------------------------------------------ *
 * The graph
 * ------------------------------------------------------------------ */

test('a full record emits every node, with no empty values anywhere', () => {
  const graph = marketSchemaGraph(market(RICH), OPTIONS) as Record<string, unknown>;
  assertNoEmptyValues(graph);

  const nodes = graph['@graph'] as Record<string, unknown>[];
  const types = nodes.map((node) => node['@type']);
  assert.deepEqual(types, [['GroceryStore', 'LocalBusiness'], 'WebPage', 'Event', 'FAQPage']);

  const business = nodes[0];
  assert.equal(business['@id'], 'https://www.farmermarkets.app/markets/brighton-farmers-market#market');
  assert.equal(business.telephone, '585-555-0100');
  assert.equal(
    business.hasMap,
    'https://www.google.com/maps/search/?api=1&query=43.1281,-77.5711'
  );
  assert.deepEqual(business.geo, {
    '@type': 'GeoCoordinates',
    latitude: 43.1281,
    longitude: -77.5711,
  });
  assert.equal('dateModified' in business, false, 'dateModified is not a LocalBusiness property');
  assert.equal('priceRange' in business, false, 'priceRange must not come back');
  assert.equal('openingHours' in business, false, 'free-text openingHours must not come back');

  const page = nodes[1];
  assert.equal(page['@type'], 'WebPage');
  assert.equal(page.dateModified, '2020-08-03');
  assert.deepEqual(page.about, { '@id': business['@id'] });

  const event = nodes[2];
  assert.deepEqual(event.location, { '@id': business['@id'] });
  assert.deepEqual(event.eventSchedule, {
    '@type': 'Schedule',
    byDay: ['Sunday'],
    startTime: '09:00',
    endTime: '13:00',
    repeatFrequency: 'P1W',
    startDate: '2026-05-01',
    endDate: '2026-10-31',
  });
});

test('the FAQPage node quotes the visible FAQ list exactly', () => {
  const graph = marketSchemaGraph(market(RICH), OPTIONS) as Record<string, unknown>;
  const nodes = graph['@graph'] as Record<string, unknown>[];
  const faqNode = nodes.find((node) => node['@type'] === 'FAQPage');
  assert.ok(faqNode);

  const questions = (faqNode.mainEntity as Record<string, never>[]).map((entity) => ({
    question: entity.name as unknown as string,
    answer: (entity.acceptedAnswer as unknown as { text: string }).text,
  }));
  assert.deepEqual(questions, marketFaqs(market(RICH)));
});

test('a sparse record emits one node and still contains nothing empty', () => {
  const graph = marketSchemaGraph(market({ slug: 'sparse', name: 'Sparse Market' }), OPTIONS) as Record<
    string,
    unknown
  >;
  assertNoEmptyValues(graph);

  const nodes = graph['@graph'] as Record<string, unknown>[];
  assert.equal(nodes.length, 1);
  const business = nodes[0];
  assert.equal('geo' in business, false);
  assert.equal('address' in business, false);
  assert.equal('openingHoursSpecification' in business, false);
  assert.equal('paymentAccepted' in business, false);
  assert.equal('sameAs' in business, false);
});

test('a weekday-only record gets hours without times and no Event', () => {
  const graph = marketSchemaGraph(
    market({
      slug: 'weekday-only',
      name: 'Weekday Only Market',
      address: '2 Market Sq, Ames, Iowa',
      city: 'Ames',
      state: 'Iowa',
      days: ['saturday'],
      snap: true,
    }),
    OPTIONS
  ) as Record<string, unknown>;
  assertNoEmptyValues(graph);

  const nodes = graph['@graph'] as Record<string, unknown>[];
  assert.deepEqual(nodes.map((node) => node['@type']), [['GroceryStore', 'LocalBusiness'], 'FAQPage']);
  assert.equal(nodes.some((node) => node['@type'] === 'WebPage'), false, 'no last_updated, no WebPage');
  assert.deepEqual(nodes[0].openingHoursSpecification, [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Saturday'] },
  ]);
});

/* ------------------------------------------------------------------ *
 * prune
 * ------------------------------------------------------------------ */

test('prune drops every shape of emptiness', () => {
  assert.equal(prune(''), undefined);
  assert.equal(prune('   '), undefined);
  assert.equal(prune([]), undefined);
  assert.equal(prune({}), undefined);
  assert.equal(prune({ '@type': 'GeoCoordinates' }), undefined);
  assert.deepEqual(prune({ '@id': 'https://example.org/#x' }), { '@id': 'https://example.org/#x' });
  assert.deepEqual(prune({ a: 1, b: '', c: [], d: { e: null } }), { a: 1 });
  assert.equal(prune(0), 0);
  assert.equal(prune(false), false);
});
