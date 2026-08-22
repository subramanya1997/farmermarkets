import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Belt and braces: every test either injects a ping double or runs with the
// pings switched off, so this suite never touches the network.
process.env.INDEXNOW_DISABLE = '1';

const { parsers, parseCsv, updateGovernmentMarkets, changedMarketSlugs, refreshUrls } =
  await import('./update-government-markets.mjs');

const retrievedAt = '2026-08-14T00:00:00.000Z';
const source = (id, parser, overrides = {}) => ({
  id,
  parser,
  enabled: true,
  name: `${id} dataset`,
  publisher: `${id} government`,
  country: 'United States',
  country_code: 'US',
  region: 'Test Region',
  catalog_url: 'https://government.example/catalog',
  data_url: 'https://government.example/data',
  fixture_file: `${id}.json`,
  license: 'Open license',
  minimum_records: 1,
  maximum_drop_fraction: 0.5,
  ...overrides
});

test('CSV parser handles commas, escaped quotes, and CRLF', () => {
  const rows = parseCsv('NAME,CITY\r\n"Market, Hall","St. ""Louis"""\r\n');
  assert.deepEqual(rows, [{ NAME: 'Market, Hall', CITY: 'St. "Louis"' }]);
});

test('Ontario parser preserves official provenance and coordinates', () => {
  const records = parsers.ontario_arcgis(source('ontario', 'ontario_arcgis', { country: 'Canada', country_code: 'CA', region: 'Ontario' }), JSON.stringify({
    features: [{ id: 1, geometry: { coordinates: [-79.4, 43.7] }, properties: { OBJECTID: 1, BusinessName: 'Test Market', Address: '1 Main St', City: 'Toronto', PostalCode: 'M1M 1M1', Hours: 'Saturday', Website: 'https://example.ca/market', GoogleMaps: 'https://www.google.com/maps/place/Test+Market' } }]
  }), retrievedAt);
  assert.equal(records[0].country, 'Canada');
  assert.equal(records[0].country_code, 'CA');
  assert.deepEqual(records[0].location.coordinates, { longitude: -79.4, latitude: 43.7 });
  assert.deepEqual(records[0].contact.websites, ['https://example.ca/market']);
  assert.equal(records[0].google_maps_url, 'https://www.google.com/maps/place/Test+Market');
  assert.equal(records[0].provenance.official, true);
});

test('New York parser maps benefits and contact data', () => {
  const records = parsers.new_york_socrata(source('new-york', 'new_york_socrata'), JSON.stringify([{
    market_name: 'Test Market', address_line_1: '1 Main St', city: 'Albany', state: 'NY', zip: '12207', latitude: '42.65', longitude: '-73.75', fmnp: 'Y', snap_status: 'Y', wicvf: 'N', phone: '5551234567', market_link: { url: 'https://example.gov/market' }
  }]), retrievedAt);
  assert.equal(records[0].payment.food_assistance.snap, true);
  assert.equal(records[0].payment.food_assistance.wic, false);
  assert.deepEqual(records[0].contact.websites, ['https://example.gov/market']);
});

test('California and Lyon parsers group multiple operating days at one location', () => {
  const california = parsers.california_wic_csv(source('california', 'california_wic_csv', { fixture_file: 'california.csv' }), [
    'COUNTY,MARKET_NAME,LOCATION_OF_MARKET,CITY,DAY,HOUR,SEASON',
    'Alameda,Example Market,1 Main St,Oakland,Tuesday,9-1,Year Round',
    'Alameda,Example Market,1 Main St,Oakland,Saturday,9-1,Year Round'
  ].join('\n'), retrievedAt);
  assert.equal(california.length, 1);
  assert.equal(california[0].operations.days.length, 2);

  const lyon = parsers.lyon_wfs(source('lyon', 'lyon_wfs', { country: 'France', country_code: 'FR', region: 'Auvergne-Rhône-Alpes' }), JSON.stringify({
    features: [
      { geometry: { coordinates: [4.8, 45.7] }, properties: { adresse: 'Place Centrale', commune: 'Lyon', insee: '69380', type: 'alimentaire', jourtenue: 'Mardi', horaires: ['Tu 08:00-12:00'] } },
      { geometry: { coordinates: [4.8, 45.7] }, properties: { adresse: 'Place Centrale', commune: 'Lyon', insee: '69380', type: 'alimentaire', jourtenue: 'Samedi', horaires: ['Sa 08:00-12:00'] } }
    ]
  }), retrievedAt);
  assert.equal(lyon.length, 1);
  assert.equal(lyon[0].operations.days.length, 2);
});

test('European public-market parsers preserve schedules, place types, and coordinates', () => {
  const toulouseSource = source('toulouse', 'toulouse_geojson', {
    country: 'France', country_code: 'FR', region: 'Occitanie', place_type: 'Public food market'
  });
  const toulouse = parsers.toulouse_geojson(toulouseSource, JSON.stringify({ features: [{
    geometry: { type: 'MultiPoint', coordinates: [[1.439, 43.611]] },
    properties: { nom: 'ARNAUD BERNARD', type: 'Alimentaire Producteurs', adresse: 'Place Arnaud-Bernard', code_postal: 31000, mercredi: '16h-20h', samedi: '07h30-13h30' }
  }] }), retrievedAt);
  assert.deepEqual(toulouse[0].location.coordinates, { longitude: 1.439, latitude: 43.611 });
  assert.deepEqual(toulouse[0].operations.days, ['Wednesday 16h-20h', 'Saturday 07h30-13h30']);
  assert(toulouse[0].organization.types.includes('Public food market'));

  const brussels = parsers.brussels_geojson(source('brussels', 'brussels_geojson', {
    country: 'Belgium', country_code: 'BE', region: 'Brussels-Capital Region', place_type: 'Public food market'
  }), JSON.stringify({ features: [{
    geometry: { type: 'Point', coordinates: [4.344, 50.844] },
    properties: { name_fr: 'Marché Annessens', name_nl: 'Anneessensmarkt', street_source_fr: 'Place Anneessens', number_box_source: '5', postalcode_source: '1000', city_source_fr: 'Bruxelles', openingdays_fr: 'Mardi', openinghours_fr: '08:00 - 14:00', internet_link_fr: 'https://government.example/market' }
  }] }), retrievedAt);
  assert.equal(brussels[0].name, 'Marché Annessens / Anneessensmarkt');
  assert.deepEqual(brussels[0].contact.websites, ['https://government.example/market']);
});

test('Asia public-market parsers normalize government-specific payloads', () => {
  const hongKong = parsers.hong_kong_fehd(source('hong-kong', 'hong_kong_fehd', {
    country: 'Hong Kong', country_code: 'HK', region: 'Hong Kong Island', place_type: 'Public market'
  }), JSON.stringify([{
    mapID: '518', nameEN: 'SMITHFIELD MARKET', nameTC: '士美非路街市', addressEN: '12K Smithfield', latitude: '22.281758,114.128688', openHourEN: '6am to 8pm', contact1: '28170806', marketType3: '12', marketType6: '14', marketCookFoodCentre: '1', disabledToilet: '1'
  }]), retrievedAt);
  assert.deepEqual(hongKong[0].location.coordinates, { longitude: 114.128688, latitude: 22.281758 });
  assert.equal(hongKong[0].operations.vendor_count, 26);
  assert.equal(hongKong[0].products.categories.prepared_food, true);

  const singapore = parsers.singapore_hawker_geojson(source('singapore', 'singapore_hawker_geojson', {
    country: 'Singapore', country_code: 'SG', region: 'Singapore', place_type: 'Hawker centre and public market'
  }), JSON.stringify({ features: [{
    geometry: { type: 'Point', coordinates: [103.8, 1.307] },
    properties: { OBJECTID: 119477, NAME: 'Commonwealth Crescent Market', ADDRESS_MYENV: '31 Commonwealth Crescent, Singapore 149644', ADDRESSPOSTALCODE: '149644', STATUS: 'Existing', NUMBER_OF_COOKED_FOOD_STALLS: 39, FMEL_UPD_D: '20241211100036' }
  }] }), retrievedAt);
  assert.equal(singapore[0].operations.vendor_count, 39);
  assert.equal(singapore[0].last_updated, '2024-12-11T10:00:36.000Z');
});

test('New Zealand and Ireland local-food parsers retain contacts and official provenance', () => {
  const upperHutt = parsers.upper_hutt_food_coops(source('upper-hutt', 'upper_hutt_food_coops', {
    country: 'New Zealand', country_code: 'NZ', region: 'Wellington Region', place_type: 'Food cooperative pickup'
  }), JSON.stringify({ features: [{
    id: 1,
    geometry: { type: 'Point', coordinates: [175.069, -41.125] },
    properties: { OBJECTID: 1, GlobalID: '{COOP-1}', Name: 'Upper Hutt Fruit & Vege Co-op', Address: 'Bradley Lane', Suburb: 'Upper Hutt', Website: 'https://www.hauorakai.nz/', Contact: 'Email: coop@example.gov.nz Phone: 021 0806 0113', Opening_Times: 'Wednesday 12pm-2pm', Type: 'Pick-up point for Fruit & Vege Packs', last_edited_date: 1764881766000 }
  }] }), retrievedAt);
  assert.deepEqual(upperHutt[0].contact.emails, ['coop@example.gov.nz']);
  assert.deepEqual(upperHutt[0].contact.websites, ['https://www.hauorakai.nz/']);
  assert.equal(upperHutt[0].provenance.official, true);

  const dlr = parsers.dlr_markets_geojson(source('dlr', 'dlr_markets_geojson', {
    country: 'Ireland', country_code: 'IE', region: 'Dún Laoghaire-Rathdown', place_type: 'Farmers market'
  }), JSON.stringify({ features: [{
    id: 1,
    geometry: { type: 'Point', coordinates: [-6.27, 53.278] },
    properties: { OBJECTID: 1, Name: 'Marlay Park CoCo Market', Location: 'Marlay Park, Rathfarnham', Day_of_Operation: 'Saturday & Sunday', Time: 'Sat 10am - 4pm', Info: 'https://government.example/dlr' }
  }] }), retrievedAt);
  assert.deepEqual(dlr[0].operations.days, ['Saturday & Sunday Sat 10am - 4pm']);
});

test('a failed source retains its previous records while healthy sources update', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'government-markets-test-'));
  const fixturesDirectory = path.join(temporaryDirectory, 'fixtures');
  await fs.mkdir(fixturesDirectory);

  const goodSource = source('good', 'new_york_socrata', { fixture_file: 'good.json' });
  const failedSource = source('failed', 'ontario_arcgis', { fixture_file: 'missing.json', country: 'Canada', country_code: 'CA' });
  const registryPath = path.join(temporaryDirectory, 'registry.json');
  const outputPath = path.join(temporaryDirectory, 'markets.json');
  const manifestPath = path.join(temporaryDirectory, 'manifest.json');
  const previous = [{
    id: 'gov:failed:old', slug: 'old-market', name: 'Old Market', country: 'CA',
    provenance: { official: true, source_id: 'failed', source_record_id: 'old' }
  }];

  await Promise.all([
    fs.writeFile(registryPath, JSON.stringify({ schema_version: 1, sources: [goodSource, failedSource] })),
    fs.writeFile(outputPath, JSON.stringify(previous)),
    fs.writeFile(path.join(fixturesDirectory, 'good.json'), JSON.stringify([{ market_name: 'New Market', city: 'Albany', state: 'NY', zip: '12207' }]))
  ]);

  const result = await updateGovernmentMarkets({
    registry: registryPath,
    output: outputPath,
    manifest: manifestPath,
    fixturesDir: fixturesDirectory,
    allowPartial: false
  });
  const written = JSON.parse(await fs.readFile(outputPath, 'utf8'));

  assert.equal(result.hasFailures, true);
  assert.equal(result.manifest.status, 'partial');
  assert.deepEqual(written.map((market) => market.provenance.source_id).sort(), ['failed', 'good']);
  assert.equal(result.manifest.sources.find((entry) => entry.id === 'failed').status, 'stale');
});

test('changed markets are the added and edited records, never the deleted ones', () => {
  const previous = [
    { id: 'gov:a', slug: 'a', name: 'A' },
    { id: 'gov:b', slug: 'b', name: 'B' },
    { id: 'gov:gone', slug: 'gone', name: 'Gone' }
  ];
  const current = [
    { id: 'gov:a', slug: 'a', name: 'A' },
    { id: 'gov:b', slug: 'b', name: 'B renamed' },
    { id: 'gov:c', slug: 'c', name: 'C' }
  ];
  assert.deepEqual(changedMarketSlugs(previous, current), ['b', 'c']);
  assert.deepEqual(changedMarketSlugs([], current), ['a', 'b', 'c']);
  assert.deepEqual(changedMarketSlugs(previous, previous), []);
});

test('changed markets expand to their market, city, state, and sitemap URLs', () => {
  const geoIndex = {
    states: [
      { slug: 'new-york', cities: [{ slug: 'albany', market_slugs: ['b'] }, { slug: 'buffalo', market_slugs: ['z'] }], uncategorized_slugs: [] },
      { slug: 'ontario', cities: [{ slug: 'toronto', market_slugs: ['q'] }], uncategorized_slugs: ['c'] },
      { slug: 'quiet', cities: [{ slug: 'nowhere', market_slugs: ['x'] }], uncategorized_slugs: [] }
    ]
  };
  const urls = refreshUrls(['b', 'c'], geoIndex, 'https://www.farmermarkets.app');

  assert.deepEqual(urls, [
    'https://www.farmermarkets.app/markets/b',
    'https://www.farmermarkets.app/markets/c',
    'https://www.farmermarkets.app/farmers-markets/new-york/albany',
    'https://www.farmermarkets.app/farmers-markets/new-york',
    'https://www.farmermarkets.app/farmers-markets/ontario',
    'https://www.farmermarkets.app/sitemap.xml'
  ]);
  assert.deepEqual(refreshUrls([], geoIndex), []);
  assert.deepEqual(refreshUrls(['b'], null), [
    'https://www.farmermarkets.app/markets/b',
    'https://www.farmermarkets.app/sitemap.xml'
  ]);
});

test('a refresh pings the injected IndexNow client and survives its failure', async () => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'government-markets-indexnow-'));
  const fixturesDirectory = path.join(temporaryDirectory, 'fixtures');
  await fs.mkdir(fixturesDirectory);

  const goodSource = source('good', 'new_york_socrata', { fixture_file: 'good.json' });
  const registryPath = path.join(temporaryDirectory, 'registry.json');
  const outputPath = path.join(temporaryDirectory, 'markets.json');
  const manifestPath = path.join(temporaryDirectory, 'manifest.json');

  await Promise.all([
    fs.writeFile(registryPath, JSON.stringify({ schema_version: 1, sources: [goodSource] })),
    fs.writeFile(path.join(fixturesDirectory, 'good.json'), JSON.stringify([{ market_name: 'New Market', city: 'Albany', state: 'NY', zip: '12207' }]))
  ]);

  const pinged = [];
  const run = (ping) => updateGovernmentMarkets({
    registry: registryPath,
    output: outputPath,
    manifest: manifestPath,
    geoIndex: path.join(temporaryDirectory, 'missing-geo-index.json'),
    fixturesDir: fixturesDirectory,
    allowPartial: true,
    ping
  });

  const first = await run(async (urls) => { pinged.push(urls); });
  assert.equal(first.changedSlugs.length, 1);
  assert.equal(pinged.length, 1);
  assert(pinged[0].some((url) => url.startsWith('https://www.farmermarkets.app/markets/new-market-albany-')));
  assert(pinged[0].includes('https://www.farmermarkets.app/sitemap.xml'));

  // An unchanged snapshot has nothing to submit, so no ping is attempted.
  const second = await run(async (urls) => { pinged.push(urls); });
  assert.deepEqual(second.changedSlugs, []);
  assert.equal(pinged.length, 1);

  // And a ping that rejects must not fail the refresh: the data is already
  // written by the time IndexNow is contacted.
  await fs.writeFile(outputPath, JSON.stringify([]));
  const third = await run(async () => { throw new Error('network down'); });
  assert.equal(third.manifest.status, 'ok');
});
