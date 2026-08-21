import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertIndexIsSound,
  buildIndex,
  entryKey,
  isPlausibleCityName,
  resolveAll,
  resolveFromFields,
  resolutionMethod,
  toGeoRecords
} from './build-geo-index.mjs';
import {
  isImpossibleStateForCoordinates,
  provinceAbbreviation,
  provinceFullName,
  stateAbbreviation,
  stateFullName,
  toSlug
} from '../src/lib/geo.ts';

/** A record in the shape `toGeoRecords` produces. */
const record = (overrides = {}) => ({
  slug: 'a-market',
  name: 'A Market',
  country: 'United States',
  country_code: 'US',
  address: null,
  city: null,
  state: null,
  zip_code: null,
  lat: null,
  lon: null,
  ...overrides
});

test('state names and abbreviations map in both directions', () => {
  assert.equal(stateAbbreviation('New York'), 'NY');
  assert.equal(stateAbbreviation('NY'), 'NY');
  assert.equal(stateAbbreviation('new york'), 'NY');
  assert.equal(stateFullName('NY'), 'New York');
  assert.equal(stateFullName('New York'), 'New York');
  assert.equal(stateAbbreviation('Ontario'), undefined, 'a province is not a US state');
  assert.equal(provinceAbbreviation('Ontario'), 'ON');
  assert.equal(provinceFullName('ON'), 'Ontario');
});

test('"NY" and "New York" resolve to the same canonical state entry', () => {
  const abbreviated = resolveFromFields(record({ state: 'NY', city: 'Rochester' }));
  const spelled = resolveFromFields(record({ state: 'New York', city: 'Rochester' }));

  assert.deepEqual(abbreviated.state, { country_code: 'US', code: 'NY', name: 'New York' });
  assert.equal(entryKey(abbreviated.state), entryKey(spelled.state));
  assert.equal(abbreviated.stateSource, 'field');
});

test('"USA" in the state column is a country, not a state', () => {
  const resolved = resolveFromFields(record({ state: 'USA', city: 'Portland' }));
  assert.equal(resolved.state, null);
});

test('a state value that cannot go with the coordinates is dropped as corrupt', () => {
  // A real row: a UK market filed under the US with "ID" in its address tail.
  const resolved = resolveFromFields(
    record({ state: 'Idaho', address: 'Tower Park, Cambridge, ID, 83610', lat: 52.34, lon: -0.18 })
  );

  assert.equal(resolved.state, null, 'Idaho cannot contain a market plotted in England');
  assert.equal(resolved.corrupt, true);
});

test('corrupt detection only fires when the coordinates disagree', () => {
  // Singapore and Toulouse markets must never come out carrying "Ontario".
  assert.equal(isImpossibleStateForCoordinates('Ontario', 1.29, 103.85), true);
  assert.equal(isImpossibleStateForCoordinates('Ontario', 43.65, -79.38), false);
  assert.equal(isImpossibleStateForCoordinates('New York', 43.65, -73.76), false);
  assert.equal(isImpossibleStateForCoordinates('New York', 22.32, 114.17), true);
  assert.equal(isImpossibleStateForCoordinates('Hawaii', 21.3, -157.8), false, 'territories count');
  assert.equal(isImpossibleStateForCoordinates('Occitanie', 43.6, 1.44), false, 'not a US/CA state');
  assert.equal(isImpossibleStateForCoordinates('New York', null, null), false, 'no coordinates, no claim');
});

test('a non-US record never carries a US or Canadian state', () => {
  const resolved = resolveFromFields(
    record({
      country: 'Singapore',
      country_code: 'SG',
      state: 'Ontario',
      city: 'Singapore',
      lat: 1.29,
      lon: 103.85
    })
  );
  assert.equal(resolved.state, null);
});

test('city and state are recovered from the address when the fields are null', () => {
  const resolved = resolveFromFields(
    record({ address: '501 Foster Street, Durham, North Carolina, 27701' })
  );

  assert.equal(resolved.city, 'Durham');
  assert.equal(resolved.citySource, 'address');
  assert.equal(resolved.state.code, 'NC');
  assert.equal(resolved.stateSource, 'address');
  assert.equal(resolutionMethod(resolved), 'address');
});

test('an address that is only a city keeps that city', () => {
  const resolved = resolveFromFields(record({ address: 'Tekamah , Nebraska' }));
  assert.equal(resolved.city, 'Tekamah');
  assert.equal(resolved.state.code, 'NE');
});

test('address fragments are not accepted as city names', () => {
  assert.equal(isPlausibleCityName('Durham'), true);
  assert.equal(isPlausibleCityName('Woluwe-Saint-Lambert'), true);
  assert.equal(isPlausibleCityName("Coeur d'Alene"), true);
  assert.equal(isPlausibleCityName('NY 10509 Off of Route 22 to Doansburg Road'), false);
  assert.equal(isPlausibleCityName('at the Eagle Rock City Hall'), false);
  assert.equal(isPlausibleCityName('17z/data=!3m1!4b1!4m5'), false);
  assert.equal(isPlausibleCityName(''), false);
  assert.equal(isPlausibleCityName(null), false);
});

test('a missing city is backfilled from the nearest located market', () => {
  const anchor = record({
    slug: 'anchor-market',
    city: 'Lincoln',
    state: 'NE',
    lat: 40.8136,
    lon: -96.7026
  });
  const nearby = record({ slug: 'nearby-market', state: 'NE', lat: 40.8156, lon: -96.7046 });
  const faraway = record({ slug: 'faraway-market', state: 'NE', lat: 42.5, lon: -99.5 });

  const [, backfilled, unchanged] = resolveAll([anchor, nearby, faraway]);

  assert.equal(backfilled.city, 'Lincoln');
  assert.equal(backfilled.citySource, 'coords');
  assert.equal(resolutionMethod(backfilled), 'coords');
  assert.equal(unchanged.city, null, 'a neighbour 200 km away is a guess, not a city');
});

test('a missing state is backfilled from the nearest located market', () => {
  const anchor = record({ slug: 'anchor', city: 'Tucson', state: 'AZ', lat: 32.2226, lon: -110.9747 });
  const stateless = record({ slug: 'stateless', address: 'Oro Valley AZ 85737, US', lat: 32.39, lon: -110.97 });

  const [, resolved] = resolveAll([anchor, stateless]);
  assert.equal(resolved.state.code, 'AZ');
});

test('the index holds one entry per state however the source spelled it', () => {
  const records = [
    record({ slug: 'a', state: 'NY', city: 'Rochester' }),
    record({ slug: 'b', state: 'New York', city: 'Rochester' }),
    record({ slug: 'c', state: 'new york', city: 'Brooklyn' })
  ];

  const index = buildIndex(resolveAll(records), { generatedAt: 'test' });

  assert.equal(index.states.length, 1);
  const [state] = index.states;
  assert.equal(state.code, 'NY');
  assert.equal(state.name, 'New York');
  assert.equal(state.slug, 'new-york');
  assert.equal(state.market_count, 3);
  assert.deepEqual(
    state.cities.map((city) => [city.slug, city.market_count]),
    [
      ['rochester', 2],
      ['brooklyn', 1]
    ]
  );
  assert.deepEqual(state.cities[0].market_slugs, ['a', 'b']);
});

test('city slugs are kebab-case and unique within a state', () => {
  assert.equal(toSlug('St. Paul'), 'st-paul');
  assert.equal(toSlug('Montréal'), 'montreal');
  assert.equal(toSlug("Coeur d'Alene"), 'coeur-dalene');

  const records = [
    record({ slug: 'a', state: 'MN', city: 'St. Paul' }),
    record({ slug: 'b', state: 'MN', city: 'St Paul' }),
    record({ slug: 'c', state: 'MN', city: 'St. Paul' })
  ];

  const index = buildIndex(resolveAll(records), { generatedAt: 'test' });
  const [state] = index.states;

  assert.equal(state.cities.length, 1, 'one spelling of a city is one city page');
  assert.equal(state.cities[0].slug, 'st-paul');
  assert.equal(state.cities[0].name, 'St. Paul', 'the most common spelling names the city');
  assert.equal(state.cities[0].market_count, 3);
});

test('international records become their own top-level entry, never a state', () => {
  const index = buildIndex(
    resolveAll([
      record({
        slug: 'brussels',
        country: 'Belgium',
        country_code: 'BE',
        state: 'Brussels-Capital Region',
        city: 'Jette',
        lat: 50.86,
        lon: 4.33
      })
    ]),
    { generatedAt: 'test' }
  );

  assert.equal(index.states.length, 1);
  assert.equal(index.states[0].code, null);
  assert.equal(index.states[0].name, 'Belgium');
  assert.equal(index.states[0].country_code, 'BE');
});

test('every record is placed exactly once, in a city, a state, or unresolved', () => {
  const records = [
    record({ slug: 'located', state: 'IA', city: 'Ames' }),
    record({ slug: 'state-only', state: 'IA' }),
    record({ slug: 'nowhere' })
  ];

  const index = buildIndex(resolveAll(records), { generatedAt: 'test' });

  assert.deepEqual(index.states[0].uncategorized_slugs, ['state-only']);
  assert.deepEqual(index.unresolved, ['nowhere']);
  assert.equal(index.market_count, 3);
  assert.doesNotThrow(() => assertIndexIsSound(index, records));
});

test('the soundness check refuses an index that loses or duplicates a record', () => {
  const records = [record({ slug: 'a', state: 'IA', city: 'Ames' })];
  const index = buildIndex(resolveAll(records), { generatedAt: 'test' });

  index.states[0].cities[0].market_slugs.push('a');
  assert.throws(() => assertIndexIsSound(index, records), /disagrees with its slugs/);

  const lossy = buildIndex(resolveAll(records), { generatedAt: 'test' });
  lossy.states[0].cities[0].market_slugs = [];
  lossy.states[0].cities[0].market_count = 0;
  assert.throws(() => assertIndexIsSound(lossy, records), /placements for 1 records/);
});

test('raw source rows are flattened, with the legacy export defaulting to the US', () => {
  const [legacy] = toGeoRecords(
    [
      {
        slug: 'x',
        name: 'X',
        location: {
          city: 'Ames',
          state: 'Iowa',
          coordinates: { latitude: 42.03, longitude: -93.63 }
        }
      }
    ],
    { defaultCountry: 'United States', defaultCountryCode: 'US' }
  );

  assert.equal(legacy.country_code, 'US');
  assert.equal(legacy.lat, 42.03);

  const [placeholder] = toGeoRecords([
    { slug: 'y', name: 'Y', location: { coordinates: { latitude: 0, longitude: 0 } } }
  ]);
  assert.equal(placeholder.lat, null, 'null island is not a location');
});
