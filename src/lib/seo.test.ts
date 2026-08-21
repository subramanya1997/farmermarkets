import assert from 'node:assert/strict';
import test from 'node:test';

const seo = await import('./seo.ts');

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

const { stateTitle, stateDescription } = seo;

/** Every title has to survive the SERP cut and read as a finished phrase. */
function assertWellFormedTitle(title: string) {
  assert.ok(title.length <= TITLE_MAX_LENGTH, `title too long (${title.length}): ${title}`);
  assert.doesNotMatch(title, /[,\--]\s*$/, `title ends on a separator: ${title}`);
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
  assert.equal(title, "Durham Farmers' Market - Durham, NC");

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
  assert.equal(title, 'Beaumont Growers - Farmers Market');

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
  assert.equal(marketTitle(market), "Durham Farmers' Market - Durham, CT");
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
  assert.match(description, /Open Samedi 8:30-12:00\./);
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
  // "… - Pittsburgh, PA Farmers Market" would overflow, so the keyword suffix
  // goes first and the location survives.
  assert.equal(medium, `${mediumName} - Pittsburgh, PA`);
});

test('a name that already says "market" never gets a second "Farmers Market"', () => {
  assert.equal(
    marketTitle({ name: 'Union Square Greenmarket', city: 'New York', state: 'NY', country_code: 'US' }),
    'Union Square Greenmarket - New York, NY'
  );
  assert.equal(marketTitle({ name: 'The Public Market' }), 'The Public Market');
  assert.doesNotMatch(marketTitle({ name: 'Ann Arbor Farmers Market' }), /Market.*Market/);
  // A name without the word does get the keyword suffix.
  assert.equal(marketTitle({ name: 'Grange Hall Produce Stand' }), 'Grange Hall Produce Stand - Farmers Market');
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
    'Open Saturdays 8am-1pm'
  );
  assert.equal(scheduleClause({ name: 'x', days: ['Friday 11:00 AM - 03:30 PM'] }), 'Open Friday 11am-3:30pm');
  assert.equal(scheduleClause({ name: 'x', season: 'summer, fall' }), undefined);
  assert.equal(scheduleClause({ name: 'x', season: 'year-round' }), undefined);
  assert.equal(scheduleClause({ name: 'x' }), undefined);
  assert.equal(formatSchedule('Monday to Sunday 9am to 5pm'), 'Monday to Sunday 9am-5pm');
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
  assert.equal(marketTitle(noCommas), "Beaumont Farmers' Market - Beaumont, TX");
  assert.match(marketDescription(noCommas), /^Beaumont Farmers' Market in Beaumont TX\./);
});

test('an all-caps name is un-shouted, but acronyms keep their case', () => {
  assert.equal(
    marketTitle({ name: 'MONTEVALLO FARMERS MARKET', city: 'Montevallo', state: 'AL', country_code: 'US' }),
    'Montevallo Farmers Market - Montevallo, AL'
  );
  assert.equal(marketTitle({ name: 'CFFMA' }), 'CFFMA - Farmers Market');
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

/* ---------------------------------------------------------------- *
 * City pages: schedule column readers and title/description copy.
 * ---------------------------------------------------------------- */

const {
  cityTitle,
  cityDescription,
  marketWeekdays,
  marketHours,
  marketSeasonLabel,
  weekdaysFromText,
} = seo;

test('weekdays are read from every spelling the source feeds use', () => {
  assert.deepEqual(weekdaysFromText('saturday'), ['Saturday']);
  assert.deepEqual(weekdaysFromText('Saturdays 8am to 1pm'), ['Saturday']);
  assert.deepEqual(weekdaysFromText('Sat, Sun'), ['Saturday', 'Sunday']);
  // Localized government feeds (Brussels ships the same slot in FR and NL).
  assert.deepEqual(weekdaysFromText('Samedi 08:30:00 - 12:00:00'), ['Saturday']);
  assert.deepEqual(weekdaysFromText('Zaterdag 08:30:00 - 12:00:00'), ['Saturday']);
  // Ranges expand inclusively, wrapping the week if they have to.
  assert.deepEqual(weekdaysFromText('Mon-Fri'), [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
  ]);
  assert.deepEqual(weekdaysFromText('Saturday to Sunday'), ['Saturday', 'Sunday']);
  assert.equal(weekdaysFromText('Daily 9:00 - 17:00').length, 7);
  // A month name must never be mistaken for a weekday.
  assert.deepEqual(weekdaysFromText('May 2-October 31'), []);
  assert.deepEqual(weekdaysFromText(''), []);
  assert.deepEqual(weekdaysFromText(null), []);
});

test('a market reports its weekdays from days and from season, in week order', () => {
  assert.deepEqual(marketWeekdays({ name: 'x', days: ['saturday'] }), ['Saturday']);
  assert.deepEqual(marketWeekdays({ name: 'x', season: 'Sundays 9am to 2pm' }), ['Sunday']);
  assert.deepEqual(
    marketWeekdays({ name: 'x', days: ['sunday', 'wednesday'], season: 'Saturdays 8am to 1pm' }),
    ['Wednesday', 'Saturday', 'Sunday']
  );
  assert.deepEqual(marketWeekdays({ name: 'x', season: 'year-round' }), []);
  assert.deepEqual(marketWeekdays({ name: 'x' }), []);
});

test('hours are only reported when the record states clock times', () => {
  assert.equal(marketHours({ name: 'x', season: 'Saturdays 8am to 1pm' }), '8am-1pm');
  assert.equal(marketHours({ name: 'x', days: ['Samedi 08:30:00 - 12:00:00'] }), '8:30-12:00');
  assert.equal(marketHours({ name: 'x', days: ['Friday 11:00 AM - 03:30 PM'] }), '11am-3:30pm');
  // Date ranges and bare weekdays are not hours.
  assert.equal(marketHours({ name: 'x', season: 'June 1-October 31' }), undefined);
  assert.equal(marketHours({ name: 'x', days: ['saturday'] }), undefined);
  assert.equal(marketHours({ name: 'x' }), undefined);
});

test('the season column carries seasons, not the weekly schedule', () => {
  assert.equal(marketSeasonLabel({ name: 'x', season: 'Year Round' }), 'Year-round');
  assert.equal(marketSeasonLabel({ name: 'x', season: 'year-round' }), 'Year-round');
  assert.equal(marketSeasonLabel({ name: 'x', season: 'summer, fall' }), 'Summer, Fall');
  assert.equal(marketSeasonLabel({ name: 'x', season: 'May-Oct' }), 'May-Oct');
  // Already rendered in the Days/Hours columns, so it is not repeated here.
  assert.equal(marketSeasonLabel({ name: 'x', season: 'Saturdays 8am to 1pm' }), undefined);
  assert.equal(marketSeasonLabel({ name: 'x' }), undefined);
});

test('city title carries the count and degrades one clause at a time', () => {
  const title = cityTitle({ city: 'Colorado Springs', region: 'CO', marketCount: 10 });
  assertWellFormedTitle(title);
  assert.equal(title, 'Farmers Markets in Colorado Springs, CO - 10 Local Markets');

  assert.equal(
    cityTitle({ city: 'Durham', region: 'NC', marketCount: 1 }),
    'Farmers Markets in Durham, NC - 1 Local Market'
  );

  // A long city/region pair drops the count, then the region, rather than
  // truncating mid-phrase.
  const long = cityTitle({
    city: 'Woluwe-Saint-Lambert',
    region: 'Brussels-Capital Region',
    marketCount: 3,
  });
  assertWellFormedTitle(long);
  assert.equal(long, 'Farmers Markets in Woluwe-Saint-Lambert - 3 Local Markets');

  const veryLong = cityTitle({
    city: 'Sault Sainte Marie Charter Township',
    region: 'MI',
    marketCount: 2,
  });
  assertWellFormedTitle(veryLong);
  assert.equal(veryLong, 'Farmers Markets in Sault Sainte Marie Charter Township, MI');

  // Past the budget even without the region, the city name itself is cut on a
  // word boundary rather than mid-word.
  const overflowing = cityTitle({
    city: 'Chatham-Kent Municipality of the County of Kent',
    region: 'ON',
    marketCount: 2,
  });
  assertWellFormedTitle(overflowing);
  assert.match(overflowing, /^Farmers Markets in Chatham-Kent Municipality/);
  assert.match(overflowing, /…$/);

  assert.equal(cityTitle({ city: '', marketCount: 0 }), 'Farmers Markets');
});

test('city description answers the count question first and only adds true clauses', () => {
  const full = cityDescription({
    city: 'Colorado Springs',
    region: 'CO',
    marketCount: 10,
    notableMarket: 'Backyard Market in Black Forest',
    notableSchedule: 'Saturdays',
    snapCount: 2,
  });
  assertWellFormedDescription(full);
  assert.match(full, /^There are 10 farmers markets in Colorado Springs, CO\./);
  assert.match(full, /Backyard Market in Black Forest is open Saturdays\./);
  assert.match(full, /2 accept SNAP\/EBT\./);

  const sparse = cityDescription({ city: 'Durham', region: 'NC', marketCount: 1 });
  assertWellFormedDescription(sparse);
  assert.equal(
    sparse,
    'There is 1 farmers market in Durham, NC. See addresses, days, hours and seasons.'
  );

  // A market with no known schedule is never claimed to be "open" anything.
  const noSchedule = cityDescription({
    city: 'Durham',
    region: 'NC',
    marketCount: 2,
    notableMarket: "Durham Farmers' Market",
    snapCount: 1,
  });
  assertWellFormedDescription(noSchedule);
  assert.doesNotMatch(noSchedule, /is open/);
  assert.match(noSchedule, /1 accepts SNAP\/EBT\./);
});

test('state title carries both counts and degrades one clause at a time', () => {
  const full = stateTitle({ state: 'Colorado', marketCount: 144, cityCount: 80 });
  assertWellFormedTitle(full);
  assert.equal(full, 'Farmers Markets in Colorado - 144 Markets in 80 Cities');

  // A long region name loses the city clause, then the market clause, rather
  // than being cut mid-phrase.
  const long = stateTitle({
    state: 'Brussels-Capital Region of Belgium',
    marketCount: 64,
    cityCount: 19,
  });
  assertWellFormedTitle(long);
  assert.equal(long, 'Farmers Markets in Brussels-Capital Region of Belgium');

  // Singulars stay grammatical.
  const one = stateTitle({ state: 'Ireland', marketCount: 1, cityCount: 1 });
  assertWellFormedTitle(one);
  assert.equal(one, 'Farmers Markets in Ireland - 1 Market in 1 City');

  assert.equal(stateTitle({ state: '  ', marketCount: 0, cityCount: 0 }), 'Farmers Markets');
});

test('state description answers the counts first and only adds true clauses', () => {
  const full = stateDescription({
    state: 'Colorado',
    marketCount: 144,
    cityCount: 80,
    biggestCity: 'Denver',
    biggestCityCount: 19,
    snapCount: 12,
  });
  assertWellFormedDescription(full);
  assert.match(full, /^There are 144 farmers markets in Colorado across 80 cities\./);
  assert.match(full, /Denver has the most with 19\./);
  assert.match(full, /12 accept SNAP\/EBT\./);

  // A single SNAP market is never described in the plural.
  const oneSnap = stateDescription({
    state: 'Colorado',
    marketCount: 144,
    cityCount: 80,
    snapCount: 1,
  });
  assertWellFormedDescription(oneSnap);
  assert.match(oneSnap, /1 accepts SNAP\/EBT\./);
  assert.doesNotMatch(oneSnap, /has the most/);

  // Nothing but a count still reads as a finished sentence.
  const sparse = stateDescription({ state: 'Ireland', marketCount: 1, cityCount: 1 });
  assertWellFormedDescription(sparse);
  assert.equal(
    sparse,
    'There is 1 farmers market in Ireland. Browse every city with addresses, days and hours.'
  );
});

test('upstream punctuation is normalized: no space before commas, no en/em dashes', () => {
  // Real record shape: NY farm stands pack the whole week into one `days`
  // string with its own " , " (gov:us_ny_farmers_markets, 5 records).
  const description = marketDescription({
    name: '13 Petals Roadside Farm Stand',
    address: '23 Mergner Road',
    city: 'Fort Johnson',
    state: 'NY',
    days: ['Mon-Fri 4pm-7pm , Sat/Sun 11am-3pm'],
    season: 'May 1-December 1',
    fmnp: true,
  });
  assert.doesNotMatch(description, / [,.]/, `space before punctuation: ${description}`);
  assert.match(description, /4pm-7pm, Sat\/Sun 11am-3pm/);

  // One record's *name* carries the same flaw ("Agricenter International , Farmers Market").
  const title = marketTitle({ name: 'Agricenter International , Farmers Market', city: 'Memphis', state: 'TN' });
  assert.doesNotMatch(title, / ,/);

  // Generated copy never emits en/em dashes; upstream ones become hyphens.
  const dashed = marketDescription({
    name: 'Riverside Market — Main Stand',
    city: 'Dayton',
    state: 'OH',
    days: ['saturday'],
    season: '9am–1pm Saturdays',
  });
  assert.doesNotMatch(dashed, /[–—]/, `en/em dash in copy: ${dashed}`);
  assert.doesNotMatch(marketTitle({ name: 'Riverside Market — Main Stand', city: 'Dayton', state: 'OH' }), /[–—]/);
});
