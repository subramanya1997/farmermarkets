#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE_URL, pingIndexNow } from './lib/indexnow.mjs';

const DEFAULT_REGISTRY = 'data/government-market-sources.json';
const DEFAULT_OUTPUT = 'data/sources/government_markets.json';
const DEFAULT_MANIFEST = 'data/sources/government_markets.manifest.json';
const DEFAULT_GEO_INDEX = 'public/data/geo_index.json';
const REQUEST_TIMEOUT_MS = 45_000;
const REQUEST_ATTEMPTS = 3;

function compact(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned || undefined;
  }
  return value;
}

function unique(values) {
  return [...new Set(values.map(compact).filter(Boolean))];
}

function groupBy(values, keyForValue) {
  const groups = new Map();
  for (const value of values) {
    const key = keyForValue(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}

function truthyFlag(value) {
  return ['y', 'yes', 'true', '1'].includes(String(value ?? '').trim().toLowerCase());
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pointCoordinates(geometry) {
  if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  if (geometry?.type === 'MultiPoint' && Array.isArray(geometry.coordinates?.[0])) return geometry.coordinates[0];
  return undefined;
}

function isoDate(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const date = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? compact(value) : date.toISOString();
}

function extractUrls(value) {
  return unique(String(value ?? '').match(/https?:\/\/[^\s,]+/gi) ?? []);
}

function extractEmails(value) {
  return unique(String(value ?? '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []);
}

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  if (quoted) throw new Error('CSV ended inside a quoted field');
  const [headers = [], ...dataRows] = rows;
  return dataRows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function sourceProvenance(source, sourceRecordId) {
  return {
    official: true,
    source_id: source.id,
    source_record_id: String(sourceRecordId),
    publisher: source.publisher,
    dataset_name: source.name,
    catalog_url: source.catalog_url,
    data_url: source.data_url,
    license: source.license,
    scope_note: source.scope_note
  };
}

function makeMarket(source, sourceRecordId, _retrievedAt, fields) {
  const recordKey = `${source.id}:${sourceRecordId}`;
  const name = compact(fields.name);
  if (!name) throw new Error(`Source ${source.id} produced a record without a name`);

  return {
    id: `gov:${recordKey}`,
    slug: `${slugify(name)}-${slugify(fields.location?.city || source.region)}-${shortHash(recordKey).slice(0, 8)}`,
    name,
    last_updated: compact(fields.lastUpdated),
    country: source.country,
    country_code: source.country_code,
    location: fields.location,
    organization: {
      types: unique(['Official government dataset', source.place_type]),
      description: source.scope_note
    },
    contact: fields.contact,
    google_maps_url: fields.google_maps_url,
    operations: fields.operations,
    products: fields.products,
    payment: fields.payment,
    amenities: fields.amenities,
    provenance: sourceProvenance(source, sourceRecordId)
  };
}

function parseOntario(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Ontario response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    const sourceRecordId = properties.OBJECTID ?? feature.id;
    return makeMarket(source, sourceRecordId, retrievedAt, {
      name: properties.BusinessName || properties.LocalName || properties.Nom,
      location: {
        address: compact(properties.Address),
        city: compact(properties.City),
        state: source.region,
        zip_code: compact(properties.PostalCode),
        coordinates: Array.isArray(coordinates) ? { longitude: coordinates[0], latitude: coordinates[1] } : undefined,
        description: compact(properties.Facilitytype)
      },
      contact: { websites: unique([properties.Website]) },
      google_maps_url: compact(properties.GoogleMaps),
      operations: { days: unique([properties.Hours]), season: compact(properties.Hours) },
      products: { categories: { wine: truthyFlag(properties.Sells_liquor) } }
    });
  });
}

function parseNewYork(source, payload, retrievedAt) {
  const rows = JSON.parse(payload);
  if (!Array.isArray(rows)) throw new Error('New York response is not an array');

  return rows.map((row) => {
    const identity = [row.market_name, row.address_line_1, row.city, row.zip].join('|');
    return makeMarket(source, shortHash(identity), retrievedAt, {
      name: row.market_name,
      location: {
        address: compact(row.address_line_1 || row.market_location),
        city: compact(row.city),
        state: compact(row.state) || 'NY',
        zip_code: compact(row.zip),
        coordinates: Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
          ? { longitude: Number(row.longitude), latitude: Number(row.latitude) }
          : undefined,
        description: compact(row.market_location)
      },
      contact: {
        phone_numbers: unique([row.phone]),
        websites: unique([row.market_link?.url || row.market_link])
      },
      operations: {
        season: compact(row.operation_season),
        days: unique([row.operation_hours])
      },
      payment: {
        food_assistance: {
          fmnp: truthyFlag(row.fmnp),
          snap: truthyFlag(row.snap_status),
          wic: truthyFlag(row.wicvf)
        }
      }
    });
  });
}

function parseDc(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('DC response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    const benefits = String(properties.BENEFITS ?? '').toLowerCase();
    return makeMarket(source, properties.GLOBALID || properties.OBJECTID || feature.id, retrievedAt, {
      name: properties.NAME,
      lastUpdated: properties.LAST_EDITED_DATE,
      location: {
        address: compact(properties.ADDRESS),
        city: compact(properties.CITY),
        state: compact(properties.STATE) || 'DC',
        zip_code: compact(properties.ZIPCODE),
        coordinates: Array.isArray(coordinates) ? { longitude: coordinates[0], latitude: coordinates[1] } : undefined,
        description: compact(properties.MD_COUNTY)
      },
      contact: {
        websites: unique([properties.WEBSITE]),
        social_media: unique([properties.SOCIAL])
      },
      operations: {
        season: unique([properties.STARTDATE, properties.ENDDATE]).join(' – ') || undefined,
        days: unique([properties.DAYS, properties.TIMES])
      },
      payment: {
        food_assistance: {
          fmnp: benefits.includes('fmnp'),
          sfmnp: benefits.includes('senior fmnp'),
          snap: benefits.includes('snap'),
          wic: benefits.includes('wic')
        }
      },
      amenities: {
        description: compact(properties.PARKING),
        parking: String(properties.PARKING ?? '').toLowerCase().includes('parking available')
      }
    });
  });
}

function parseCalifornia(source, payload, retrievedAt) {
  const grouped = new Map();
  for (const row of parseCsv(payload)) {
    const identity = [row.MARKET_NAME, row.LOCATION_OF_MARKET, row.CITY].join('|');
    const entry = grouped.get(identity) ?? { row, days: [], hours: [], seasons: [] };
    entry.days.push(row.DAY);
    entry.hours.push([row.DAY, row.HOUR].filter(Boolean).join(' '));
    entry.seasons.push(row.SEASON);
    grouped.set(identity, entry);
  }

  return [...grouped.entries()].map(([identity, entry]) => makeMarket(source, shortHash(identity), retrievedAt, {
    name: entry.row.MARKET_NAME,
    location: {
      address: compact(entry.row.LOCATION_OF_MARKET),
      city: compact(entry.row.CITY),
      state: 'CA'
    },
    operations: {
      season: unique(entry.seasons).join('; ') || undefined,
      days: unique(entry.hours.length ? entry.hours : entry.days)
    },
    payment: { food_assistance: { wic: true } }
  }));
}

function parseLyon(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Lyon response is missing features');
  const grouped = new Map();

  for (const feature of document.features) {
    const properties = feature.properties ?? {};
    const coordinates = feature.geometry?.coordinates;
    const identity = [properties.adresse, properties.commune, ...(coordinates ?? [])].join('|');
    const entry = grouped.get(identity) ?? { properties, coordinates, schedules: [] };
    const hours = Array.isArray(properties.horaires) ? properties.horaires.join(', ') : properties.horaires;
    entry.schedules.push([properties.jourtenue, hours].filter(Boolean).join(' '));
    grouped.set(identity, entry);
  }

  return [...grouped.entries()].map(([identity, entry]) => makeMarket(source, shortHash(identity), retrievedAt, {
    name: `Marché de ${entry.properties.adresse}`,
    location: {
      address: compact(entry.properties.adresse),
      city: compact(entry.properties.commune),
      state: source.region,
      coordinates: Array.isArray(entry.coordinates)
        ? { longitude: entry.coordinates[0], latitude: entry.coordinates[1] }
        : undefined,
      description: compact(entry.properties.type)
    },
    operations: { days: unique(entry.schedules) }
  }));
}

function parseToulouse(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Toulouse response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    const sourceRecordId = shortHash([properties.nom, properties.adresse, properties.code_postal].join('|'));
    const schedules = [
      ['Monday', properties.lundi],
      ['Tuesday', properties.mardi],
      ['Wednesday', properties.mercredi],
      ['Thursday', properties.jeudi],
      ['Friday', properties.vendredi],
      ['Saturday', properties.samedi],
      ['Sunday', properties.dimanche]
    ].filter(([, hours]) => compact(hours)).map(([day, hours]) => `${day} ${hours}`);

    return makeMarket(source, sourceRecordId, retrievedAt, {
      name: properties.nom,
      location: {
        address: compact(properties.adresse),
        city: 'Toulouse',
        state: source.region,
        zip_code: compact(String(properties.code_postal ?? '')),
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined,
        description: compact(properties.type)
      },
      operations: {
        days: unique(schedules.length ? schedules : [properties.jours_de_tenue])
      },
      products: {
        categories: {
          fresh_produce: /producteur|bio/i.test(String(properties.type ?? ''))
        }
      }
    });
  });
}

function parseBrussels(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Brussels response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    const address = [properties.street_source_fr, properties.number_box_source].filter(Boolean).join(' ');
    const sourceRecordId = shortHash([properties.name_fr, address, properties.postalcode_source].join('|'));
    const multilingualName = unique([properties.name_fr, properties.name_nl]).join(' / ');

    return makeMarket(source, sourceRecordId, retrievedAt, {
      name: multilingualName,
      location: {
        address: compact(address),
        city: compact(properties.city_source_fr) || 'Bruxelles',
        state: source.region,
        zip_code: compact(properties.postalcode_source),
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined,
        description: unique([properties.type_infrastructure_fr, properties.type_infrastructure_nl]).join(' / ') || undefined
      },
      contact: {
        websites: unique([properties.internet_link_fr, properties.internet_link_nl])
      },
      operations: {
        days: unique([
          [properties.openingdays_fr, properties.openinghours_fr].filter(Boolean).join(' '),
          [properties.openingdays_nl, properties.openinghours_nl].filter(Boolean).join(' ')
        ])
      }
    });
  });
}

function parseHongKong(source, payload, retrievedAt) {
  const rows = JSON.parse(payload);
  if (!Array.isArray(rows)) throw new Error('Hong Kong response is not an array');

  return rows.map((row) => {
    const [latitude, longitude] = String(row.latitude ?? '').split(',').map((value) => finiteNumber(value.trim()));
    const stallCount = Array.from({ length: 33 }, (_, index) => finiteNumber(row[`marketType${index + 1}`]) ?? 0)
      .reduce((sum, count) => sum + count, 0);
    return makeMarket(source, row.mapID, retrievedAt, {
      name: row.nameEN,
      location: {
        address: compact(row.addressEN),
        city: source.region,
        state: 'Hong Kong',
        coordinates: Number.isFinite(latitude) && Number.isFinite(longitude) ? { longitude, latitude } : undefined,
        description: unique([row.nameTC, row.nameSC]).join(' / ') || undefined
      },
      contact: { phone_numbers: unique([row.contact1, row.contact2]) },
      operations: {
        days: unique([row.openHourEN]),
        vendor_count: stallCount || undefined
      },
      products: {
        categories: {
          prepared_food: truthyFlag(row.marketCookFoodCentre)
        }
      },
      amenities: {
        wheelchair_accessible: truthyFlag(row.marketStairLift) || truthyFlag(row.disabledToilet) || truthyFlag(row.uni_toilet),
        restrooms: truthyFlag(row.disabledToilet) || truthyFlag(row.portableToilet) || truthyFlag(row.uni_toilet),
        description: compact(row.remarkEN)
      }
    });
  });
}

function parseSingapore(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Singapore response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    return makeMarket(source, properties.OBJECTID ?? shortHash(properties.NAME), retrievedAt, {
      name: properties.NAME || properties.ADDRESSBUILDINGNAME,
      lastUpdated: isoDate(properties.FMEL_UPD_D && String(properties.FMEL_UPD_D).replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z')),
      location: {
        address: compact(properties.ADDRESS_MYENV || [properties.ADDRESSBLOCKHOUSENUMBER, properties.ADDRESSSTREETNAME].filter(Boolean).join(' ')),
        city: 'Singapore',
        state: 'Singapore',
        zip_code: compact(properties.ADDRESSPOSTALCODE),
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined,
        description: unique([properties.STATUS, properties.DESCRIPTION]).join('; ') || undefined
      },
      operations: { vendor_count: finiteNumber(properties.NUMBER_OF_COOKED_FOOD_STALLS) },
      products: { categories: { prepared_food: true, fresh_produce: /market/i.test(String(properties.NAME ?? '')) } }
    });
  });
}

function parseUpperHuttFoodCoops(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Upper Hutt food cooperatives response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    const locationDescription = unique([properties.Host_Name, properties.Location_Description, properties.Type, properties.Description]).join('; ');
    return makeMarket(source, properties.GlobalID || properties.OBJECTID || feature.id, retrievedAt, {
      name: properties.Name,
      lastUpdated: isoDate(properties.last_edited_date),
      location: {
        address: compact(properties.Address),
        city: compact(properties.Suburb) || 'Upper Hutt',
        state: source.region,
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined,
        description: compact(locationDescription)
      },
      contact: {
        phone_numbers: unique(String(properties.Contact ?? '').match(/(?:\+?\d[\d ()-]{6,}\d)/g) ?? []),
        emails: extractEmails(properties.Contact),
        websites: unique([...extractUrls(properties.Website), ...extractUrls(properties.Contact)])
      },
      operations: { days: unique([properties.Opening_Times]) },
      products: { categories: { fresh_produce: true } }
    });
  });
}

function parseUpperHuttGardens(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('Upper Hutt community gardens response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    return makeMarket(source, properties.GlobalID || properties.OBJECTID || feature.id, retrievedAt, {
      name: properties.Name,
      lastUpdated: isoDate(properties.last_edited_date),
      location: {
        address: compact(properties.Address),
        city: compact(properties.Suburb) || 'Upper Hutt',
        state: source.region,
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined,
        description: unique([properties.Host_Organisation, properties.Location_Description]).join('; ') || undefined
      },
      contact: {
        phone_numbers: unique(String(properties.Contact_Details ?? '').match(/(?:\+?\d[\d ()-]{6,}\d)/g) ?? []),
        emails: extractEmails(properties.Contact_Details),
        websites: extractUrls(properties.Contact_Details)
      },
      operations: { days: unique([properties.Opening_Times]) },
      products: { categories: { fresh_produce: true } }
    });
  });
}

function parseDlrMarkets(source, payload, retrievedAt) {
  const document = JSON.parse(payload);
  if (!Array.isArray(document.features)) throw new Error('DLR response is missing features');

  return document.features.map((feature) => {
    const properties = feature.properties ?? {};
    const coordinates = pointCoordinates(feature.geometry);
    return makeMarket(source, properties.OBJECTID || feature.id || shortHash(properties.Name), retrievedAt, {
      name: properties.Name,
      location: {
        address: compact(properties.Location),
        city: source.region,
        state: source.region,
        coordinates: coordinates ? { longitude: finiteNumber(coordinates[0]), latitude: finiteNumber(coordinates[1]) } : undefined
      },
      contact: { websites: unique([properties.Info]) },
      operations: { days: unique([[properties.Day_of_Operation, properties.Time].filter(Boolean).join(' ')]) }
    });
  });
}

const PARSERS = {
  ontario_arcgis: parseOntario,
  new_york_socrata: parseNewYork,
  dc_arcgis: parseDc,
  california_wic_csv: parseCalifornia,
  lyon_wfs: parseLyon,
  toulouse_geojson: parseToulouse,
  brussels_geojson: parseBrussels,
  hong_kong_fehd: parseHongKong,
  singapore_hawker_geojson: parseSingapore,
  upper_hutt_food_coops: parseUpperHuttFoodCoops,
  upper_hutt_gardens: parseUpperHuttGardens,
  dlr_markets_geojson: parseDlrMarkets
};

function validateRecords(records, source) {
  if (!Array.isArray(records)) throw new Error(`${source.id} parser did not return an array`);
  if (records.length < source.minimum_records) {
    throw new Error(`${source.id} returned ${records.length} records; minimum is ${source.minimum_records}`);
  }

  const ids = new Set();
  const slugs = new Set();
  for (const market of records) {
    if (!market.id || !market.slug || !market.name) throw new Error(`${source.id} produced an incomplete market`);
    if (!market.country || !market.country_code || !market.location) {
      throw new Error(`${source.id} produced a market without normalized location or country fields`);
    }
    if (market.provenance?.official !== true || market.provenance?.source_id !== source.id) {
      throw new Error(`${source.id} produced a market without matching official provenance`);
    }
    if (ids.has(market.id)) throw new Error(`${source.id} produced duplicate id ${market.id}`);
    if (slugs.has(market.slug)) throw new Error(`${source.id} produced duplicate slug ${market.slug}`);
    ids.add(market.id);
    slugs.add(market.slug);

    const coordinates = market.location?.coordinates;
    if (coordinates && (
      !Number.isFinite(coordinates.latitude) || Math.abs(coordinates.latitude) > 90 ||
      !Number.isFinite(coordinates.longitude) || Math.abs(coordinates.longitude) > 180
    )) {
      throw new Error(`${source.id} produced invalid coordinates for ${market.id}`);
    }
  }
}

function validateGlobalRecords(records) {
  const ids = new Set();
  const slugs = new Set();
  for (const market of records) {
    if (ids.has(market.id)) throw new Error(`Duplicate global market id ${market.id}`);
    if (slugs.has(market.slug)) throw new Error(`Duplicate global market slug ${market.slug}`);
    ids.add(market.id);
    slugs.add(market.slug);
  }
}

async function fetchUrl(url) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'application/json,text/csv;q=0.9,*/*;q=0.8',
          'User-Agent': 'farmermarkets.app official-data updater/1.0'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchPayload(source) {
  const payload = await fetchUrl(source.data_url);
  if (source.download_strategy !== 'data_gov_sg_poll') return payload;

  const pollResponse = JSON.parse(payload);
  const downloadUrl = pollResponse?.data?.url;
  if (!downloadUrl || typeof downloadUrl !== 'string') {
    throw new Error(`${source.id} poll response did not include a download URL`);
  }
  return await fetchUrl(downloadUrl);
}

async function readJsonIfPresent(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

/**
 * Slugs of the markets a refresh actually added or changed.
 *
 * The manifest already records which *sources* changed, but IndexNow wants
 * URLs, so the two snapshots are compared record by record: a record whose id
 * is new, or whose serialized content differs from the previous run, is a page
 * whose HTML changed. Deletions are deliberately excluded — the page is gone,
 * and asking an engine to recrawl a 404 buys nothing.
 */
export function changedMarketSlugs(previousRecords, currentRecords) {
  const previousById = new Map();
  for (const market of previousRecords ?? []) {
    if (market?.id) previousById.set(market.id, JSON.stringify(market));
  }

  const slugs = [];
  for (const market of currentRecords ?? []) {
    if (!market?.slug) continue;
    const previous = previousById.get(market.id);
    if (previous === undefined || previous !== JSON.stringify(market)) slugs.push(market.slug);
  }
  return [...new Set(slugs)];
}

/**
 * Every URL a set of changed market slugs affects: the market pages
 * themselves, the city and state hubs that list them (looked up in the
 * committed geo index, which is what the routes are generated from), and the
 * sitemap index.
 */
export function refreshUrls(changedSlugs, geoIndex, siteUrl = SITE_URL) {
  if (!changedSlugs.length) return [];
  const changed = new Set(changedSlugs);
  const paths = changedSlugs.map((slug) => `/markets/${slug}`);

  for (const state of geoIndex?.states ?? []) {
    let stateTouched = false;
    for (const city of state.cities ?? []) {
      if (!(city.market_slugs ?? []).some((slug) => changed.has(slug))) continue;
      stateTouched = true;
      paths.push(`/farmers-markets/${state.slug}/${city.slug}`);
    }
    if (!stateTouched) {
      stateTouched = (state.uncategorized_slugs ?? []).some((slug) => changed.has(slug));
    }
    if (stateTouched) paths.push(`/farmers-markets/${state.slug}`);
  }

  paths.push('/sitemap.xml');
  return [...new Set(paths)].map((value) => new URL(value, siteUrl).toString());
}

function parseArguments(argv) {
  const options = {
    registry: DEFAULT_REGISTRY,
    output: DEFAULT_OUTPUT,
    manifest: DEFAULT_MANIFEST,
    geoIndex: DEFAULT_GEO_INDEX,
    fixturesDir: undefined,
    allowPartial: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--registry') options.registry = argv[++index];
    else if (argument === '--geo-index') options.geoIndex = argv[++index];
    else if (argument === '--output') options.output = argv[++index];
    else if (argument === '--manifest') options.manifest = argv[++index];
    else if (argument === '--fixtures-dir') options.fixturesDir = argv[++index];
    else if (argument === '--allow-partial') options.allowPartial = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export async function updateGovernmentMarkets(options) {
  const root = process.cwd();
  const registryPath = path.resolve(root, options.registry);
  const outputPath = path.resolve(root, options.output);
  const manifestPath = path.resolve(root, options.manifest);
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  const enabledSources = registry.sources.filter((source) => source.enabled);
  const previousRecords = await readJsonIfPresent(outputPath, []);
  const previousBySource = groupBy(previousRecords, (market) => market.provenance?.source_id);
  const retrievedAt = new Date().toISOString();
  const records = [];
  const sourceResults = [];

  for (const source of enabledSources) {
    const previous = previousBySource.get(source.id) ?? [];
    try {
      const parser = PARSERS[source.parser];
      if (!parser) throw new Error(`No parser registered for ${source.parser}`);
      const payload = options.fixturesDir
        ? await fs.readFile(path.resolve(options.fixturesDir, source.fixture_file), 'utf8')
        : await fetchPayload(source);
      const parsed = parser(source, payload, retrievedAt);
      validateRecords(parsed, source);
      parsed.sort((left, right) => left.id.localeCompare(right.id));

      if (previous.length > 0) {
        const minimumAllowed = Math.floor(previous.length * (1 - source.maximum_drop_fraction));
        if (parsed.length < minimumAllowed) {
          throw new Error(`${source.id} dropped from ${previous.length} to ${parsed.length}; minimum allowed is ${minimumAllowed}`);
        }
      }

      const sourceHash = createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
      const previousHash = createHash('sha256').update(JSON.stringify(previous)).digest('hex');
      const status = previous.length > 0 && sourceHash === previousHash ? 'unchanged' : 'updated';
      records.push(...parsed);
      sourceResults.push({
        id: source.id,
        name: source.name,
        publisher: source.publisher,
        country: source.country,
        country_code: source.country_code,
        region: source.region,
        status,
        record_count: parsed.length,
        previous_record_count: previous.length,
        sha256: sourceHash,
        catalog_url: source.catalog_url,
        data_url: source.data_url,
        license: source.license,
        retrieved_at: retrievedAt
      });
      console.log(`${status} ${source.id}: ${parsed.length} records`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      records.push(...previous);
      sourceResults.push({
        id: source.id,
        name: source.name,
        publisher: source.publisher,
        country: source.country,
        country_code: source.country_code,
        region: source.region,
        status: previous.length ? 'stale' : 'failed',
        record_count: previous.length,
        previous_record_count: previous.length,
        catalog_url: source.catalog_url,
        data_url: source.data_url,
        license: source.license,
        retrieved_at: retrievedAt,
        error: message
      });
      console.error(`${source.id}: ${message}${previous.length ? `; retained ${previous.length} previous records` : ''}`);
    }
  }

  if (records.length === 0) throw new Error('No official records are available; refusing to write an empty snapshot');
  records.sort((left, right) => left.id.localeCompare(right.id));
  validateGlobalRecords(records);

  const outputContents = `${JSON.stringify(records, null, 2)}\n`;
  const failures = sourceResults.filter((source) => ['stale', 'failed'].includes(source.status));
  const disabledSources = registry.sources
    .filter((source) => !source.enabled)
    .map((source) => ({ id: source.id, name: source.name, disabled_reason: source.disabled_reason }));
  const manifest = {
    schema_version: 1,
    generated_at: retrievedAt,
    status: failures.length ? 'partial' : 'ok',
    record_count: records.length,
    sha256: createHash('sha256').update(outputContents).digest('hex'),
    sources: sourceResults,
    disabled_sources: disabledSources
  };

  await atomicWrite(outputPath, outputContents);
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${records.length} official markets to ${path.relative(root, outputPath)} (${manifest.status})`);

  // Push the changed URLs to IndexNow (Bing/Yandex/Naver/Seznam/Yep). The
  // snapshot is already on disk at this point: `pingIndexNow` swallows network
  // and HTTP errors, and `INDEXNOW_DISABLE=1` turns the whole thing off, so a
  // refresh can never fail because an engine was unreachable. Tests inject
  // `options.ping` instead of reaching the network.
  const changedSlugs = changedMarketSlugs(previousRecords, records);
  let geoIndex = null;
  try {
    geoIndex = await readJsonIfPresent(path.resolve(root, options.geoIndex ?? DEFAULT_GEO_INDEX), null);
  } catch (error) {
    // A missing or unreadable geo index only costs us the hub URLs.
    console.warn(`indexnow: could not read the geo index: ${error instanceof Error ? error.message : error}`);
  }
  const urls = refreshUrls(changedSlugs, geoIndex);
  const ping = options.ping ?? pingIndexNow;
  console.log(`indexnow: ${changedSlugs.length} changed market(s) → ${urls.length} URL(s)`);
  let pingResult;
  if (urls.length) {
    try {
      pingResult = await ping(urls);
    } catch (error) {
      console.warn(`indexnow: ping failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  return { manifest, hasFailures: failures.length > 0, changedSlugs, indexNowUrls: urls, indexNow: pingResult };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await updateGovernmentMarkets(options);
  if (result.hasFailures && !options.allowPartial) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}

export const parsers = PARSERS;
export { parseCsv, validateGlobalRecords, validateRecords };
