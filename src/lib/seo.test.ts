import assert from 'node:assert/strict';
import test from 'node:test';

const seo = await import(
  // @ts-expect-error Node runs this fixture with --experimental-strip-types.
  './seo.ts'
);

const {
  marketTitle,
  marketDescription,
  marketLocationLine,
  resolveLocation,
  stateAbbreviation,
  stateFullName,
  scheduleClause,
  formatSchedule,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} = seo;

/** Every title has to survive the SERP cut and read as a finished phrase. */
function assertWellFormedTitle(title: string) {
  assert.ok(title.length <= TITLE_MAX_LENGTH, `title too long (${title.length}): ${title}`);
  assert.doesNotMatch(title, /[,\-—]\s*$/, `title ends on a separator: ${title}`);
  assert.doesNotMatch(title, /\b(in|at|of|and)\s*$/i, `title ends on a preposition: ${title}`);
  assert.doesNotMatch(title, /\s{2,}/, `title has a collapsed empty slot: ${title}`);
}

/** Descriptions must never expose an empty template slot. */
function assertWellFormedDescription(description: string) {
  assert.ok(
    description.length <= DESCRIPTION_MAX_LENGTH,
    `description too long (${description.length}): ${description}`
  );
  assert.doesNotMatch(description, /\s{2,}/, description);
  assert.doesNotMatch(description, /\s\./, description);
  assert.doesNotMatch(description, /\.\./, description);
  assert.doesNotMatch(description, /\bin\s*[.,]/i, description);
  assert.doesNotMatch(description, /Find fresh \./, description);
  assert.equal(description, description.trim());
  assert.match(description, /\.$/, description);
}

const durham = {
  name: "Durham Farmers' Market",
  address: '501 Foster Street, Durham, North Carolina, 27701',
  city: 'Durham',
  state: 'North Carolina',
  zip_code: '27701',
  country: 'United States',
  country_code: 'US',
  season: 'summer, fall',
  days: ['saturday'],
  wic: true,
  sfmnp: true,
  snap: true,
};

test('full record: title keeps name and abbreviated location, description names place, hours, season and programs', () => {
  const title = marketTitle(durham);
  assertWellFormedTitle(title);
  assert.equal(title, "Durham Farmers' Market — Durham, NC");

  const description = marketDescription(durham);
  assertWellFormedDescription(description);
  assert.equal(
    description,
    "Durham Farmers' Market at 501 Foster St, Durham NC. Open Saturdays, summer and fall. Accepts SNAP, WIC and SFMNP."
  );
});

test('record with no products still produces a full description (products are never used)', () => {
  const withProducts = marketDescription({ ...durham, products: ['Apples', 'Honey'] } as never);
  const withoutProducts = marketDescription(durham);
  assert.equal(withProducts, withoutProducts);
  assert.doesNotMatch(withoutProducts, /Find fresh/);
});

test('record with no city or state: no dangling location clause', () => {
  const market = {
    name: 'Wilsonville Farmers Market',
    address: 'Wilsonville',
    city: null,
    state: null,
    country_code: 'US',
  };

  const title = marketTitle(market);
  assertWellFormedTitle(title);
  assert.equal(title, 'Wilsonville Farmers Market');

  const description = marketDescription(market);
  assertWellFormedDescription(description);
  assert.match(description, /^Wilsonville Farmers Market at Wilsonville\./);
});

test('record with nothing but a name gets a self-contained sentence', () => {
  const market = { name: 'Beaumont Growers' };
  const title = marketTitle(market);
  assertWellFormedTitle(title);
  assert.equal(title, 'Beaumont Growers — Farmers Market');

  const description = marketDescription(market);
  assertWellFormedDescription(description);
  assert.equal(
    description,
    'Beaumont Growers is a local farmers market. Fresh local produce, market details and directions.'
  );
});

test('city and state are recovered from the address when the fields are null', () => {
  const market = {
    name: "Durham Farmers' Market",
    address: 'Town Green, Durham, CT, 06422',
    city: null,
    state: null,
    zip_code: '06422',
    country_code: 'US',
  };

  assert.deepEqual(resolveLocation(market), {
    street: 'Town Green',
    city: 'Durham',
    state: 'CT',
  });
  assert.equal(marketTitle(market), "Durham Farmers' Market — Durham, CT");
  assert.match(marketDescription(market), /^Durham Farmers' Market at Town Green, Durham CT\./);
});

test('record with no hours or season: description stops after the place', () => {
  const market = {
    name: 'Colorado Farm and Art Market',
    address: '7350 Pine Creek Road, Colorado Springs, Colorado, 80919',
    city: 'Colorado Springs',
    state: 'Colorado',
    zip_code: '80919',
    country_code: 'US',
    sfmnp: true,
  };

  const description = marketDescription(market);
  assertWellFormedDescription(description);
  assert.equal(
    description,
    'Colorado Farm and Art Market at 7350 Pine Creek Rd, Colorado Springs CO. Accepts SFMNP. Fresh local produce, market details and directions.'
  );
  assert.doesNotMatch(description, /Open/);
});

test('international record keeps its own wording and localized schedule', () => {
  const market = {
    name: 'Marché bio du gué / Biomarkt van Gué',
    address: 'Avenue de Mai 2',
    city: 'Woluwe-Saint-Lambert',
    state: 'Brussels-Capital Region',
    zip_code: '1200',
    country: 'Belgium',
    country_code: 'BE',
    days: ['Samedi 08:30:00 - 12:00:00', 'Zaterdag 08:30:00 - 12:00:00'],
  };

  const title = marketTitle(market);
  assertWellFormedTitle(title);
  // The full "City, Region" clause does not fit, so the location is dropped
  // rather than truncated mid-word.
  assert.equal(title, 'Marché bio du gué / Biomarkt van Gué');

  const description = marketDescription(market);
  assertWellFormedDescription(description);
  assert.match(description, /Avenue de Mai 2, Woluwe-Saint-Lambert, Brussels-Capital Region\./);
  assert.match(description, /Open Samedi 8:30–12:00\./);
  // The Dutch duplicate of the same slot is not repeated.
  assert.doesNotMatch(description, /Zaterdag/);
});

test('long name degrades by dropping the suffix, then the location, never mid-word', () => {
  const long = {
    name: 'Southwestern Pennsylvania Regional Growers Cooperative Association Stand',
    city: 'Pittsburgh',
    state: 'Pennsylvania',
    country_code: 'US',
  };
  const title = marketTitle(long);
  assertWellFormedTitle(title);
  assert.match(title, /…$/);
  assert.ok(!title.includes('Coopera…'), `truncated mid-word: ${title}`);

  const mediumName = 'Chestnut Hill Growers Collective';
  const medium = marketTitle({ ...long, name: mediumName });
  assertWellFormedTitle(medium);
  // "… — Pittsburgh, PA Farmers Market" would overflow, so the keyword suffix
  // goes first and the location survives.
  assert.equal(medium, `${mediumName} — Pittsburgh, PA`);
});

test('a name that already says "market" never gets a second "Farmers Market"', () => {
  assert.equal(
    marketTitle({ name: 'Union Square Greenmarket', city: 'New York', state: 'NY', country_code: 'US' }),
    'Union Square Greenmarket — New York, NY'
  );
  assert.equal(marketTitle({ name: 'The Public Market' }), 'The Public Market');
  assert.doesNotMatch(marketTitle({ name: 'Ann Arbor Farmers Market' }), /Market.*Market/);
  // A name without the word does get the keyword suffix.
  assert.equal(marketTitle({ name: 'Grange Hall Produce Stand' }), 'Grange Hall Produce Stand — Farmers Market');
});

test('state abbreviations map both directions and ignore non-US regions', () => {
  assert.equal(stateAbbreviation('New York'), 'NY');
  assert.equal(stateAbbreviation('new york'), 'NY');
  assert.equal(stateAbbreviation('NY'), 'NY');
  assert.equal(stateAbbreviation('ny'), 'NY');
  assert.equal(stateAbbreviation('District of Columbia'), 'DC');
  assert.equal(stateAbbreviation('Puerto Rico'), 'PR');
  assert.equal(stateAbbreviation('Ontario'), undefined);
  assert.equal(stateAbbreviation(''), undefined);
  assert.equal(stateAbbreviation(undefined), undefined);
  assert.equal(stateFullName('nc'), 'North Carolina');
  assert.equal(stateFullName('North Carolina'), 'North Carolina');
});

test('a state given as a full name and as an abbreviation produce the same title', () => {
  const base = { name: 'Riverside Growers Stand', city: 'Albany', country_code: 'US' };
  assert.equal(marketTitle({ ...base, state: 'New York' }), marketTitle({ ...base, state: 'NY' }));
  assert.match(marketTitle({ ...base, state: 'New York' }), /Albany, NY/);
});

test('schedules are normalized from every shape in the data', () => {
  assert.equal(scheduleClause({ name: 'x', days: ['saturday', 'wednesday'] }), 'Open Saturdays and Wednesdays');
  assert.equal(
    scheduleClause({ name: 'x', days: ['saturday'], season: 'Saturdays 8am to 1pm' }),
    'Open Saturdays 8am–1pm'
  );
  assert.equal(scheduleClause({ name: 'x', days: ['Friday 11:00 AM - 03:30 PM'] }), 'Open Friday 11am–3:30pm');
  assert.equal(scheduleClause({ name: 'x', season: 'summer, fall' }), undefined);
  assert.equal(scheduleClause({ name: 'x', season: 'year-round' }), undefined);
  assert.equal(scheduleClause({ name: 'x' }), undefined);
  assert.equal(formatSchedule('Monday to Sunday 9am to 5pm'), 'Monday to Sunday 9am–5pm');
});

test('a city/state tail glued to the street line is not repeated in the snippet', () => {
  const market = {
    name: "Sun Foods Farmers' Market",
    address: '544 University Ave W, St Paul, MN 55103',
    city: 'St Paul',
    state: 'MN',
    country_code: 'US',
  };
  assertWellFormedDescription(marketDescription(market));
  assert.match(marketDescription(market), /^Sun Foods Farmers' Market at 544 University Ave W, St Paul MN\./);

  // The same record shape with no commas around the state at all.
  const noCommas = {
    name: "Beaumont Farmers' Market",
    address: 'Beaumont Texas 77707',
    city: null,
    state: null,
    zip_code: '77707',
    country_code: 'US',
  };
  assert.equal(marketTitle(noCommas), "Beaumont Farmers' Market — Beaumont, TX");
  assert.match(marketDescription(noCommas), /^Beaumont Farmers' Market in Beaumont TX\./);
});

test('an all-caps name is un-shouted, but acronyms keep their case', () => {
  assert.equal(
    marketTitle({ name: 'MONTEVALLO FARMERS MARKET', city: 'Montevallo', state: 'AL', country_code: 'US' }),
    'Montevallo Farmers Market — Montevallo, AL'
  );
  assert.equal(marketTitle({ name: 'CFFMA' }), 'CFFMA — Farmers Market');
});

test('on-page location line spells the state out and never duplicates it', () => {
  assert.equal(marketLocationLine(durham), 'Durham, North Carolina');
  assert.equal(marketLocationLine({ name: 'x', city: 'California', state: 'California', country_code: 'US' }), 'California');
  assert.equal(marketLocationLine({ name: 'x' }), undefined);
  assert.equal(
    marketLocationLine({ name: 'x', city: 'Singapore', state: 'Singapore', country: 'Singapore', country_code: 'SG' }),
    'Singapore'
  );
});
