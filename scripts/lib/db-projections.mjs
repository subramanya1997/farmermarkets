const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function realDate(value) {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Never attach an invented timezone or turn a date into a midnight timestamp. */
export function projectEventTime(value) {
  if (value === undefined || value === null) return { source: null, precision: 'unknown', date: null, timestamp: null };
  if (typeof value !== 'string') throw new Error('Event start/end must be strings');
  if (realDate(value)) return { source: value, precision: 'date', date: value, timestamp: null };
  const match = DATETIME.exec(value);
  if (match && realDate(match[1])) {
    if (!match[3]) return { source: value, precision: 'local_datetime', date: match[1], timestamp: null };
    if (Number.isFinite(Date.parse(value))) return { source: value, precision: 'timestamp', date: null, timestamp: value };
  }
  return { source: value, precision: 'unknown', date: null, timestamp: null };
}

function sourcedRow(market, item, collection, seen) {
  const marketId = String(market.id);
  if (!ITEM_ID.test(item?.id)) throw new Error(`${marketId} ${collection} needs a stable item ID`);
  if (seen.has(item.id)) throw new Error(`${marketId} ${collection} has duplicate item ID ${item.id}`);
  seen.add(item.id);
  if (!item.value || typeof item.value.name !== 'string' || !item.value.name.trim()) throw new Error(`${marketId} ${collection} ${item.id} needs a name`);
  if (!realDate(item.verified_at)) throw new Error(`${marketId} ${collection} ${item.id} needs a verified date`);
  if (!Array.isArray(item.source_ids) || !item.source_ids.length) throw new Error(`${marketId} ${collection} ${item.id} needs provenance`);
  const byId = new Map((market.enrichment?.sources ?? []).filter((source) => source.id).map((source) => [source.id, source]));
  const sources = item.source_ids.map((id) => {
    const source = byId.get(id);
    if (!source) throw new Error(`${marketId} ${collection} ${item.id} references unknown source ${id}`);
    return source;
  });
  return {
    market_id: marketId, item_id: item.id, name: item.value.name, payload: item.value,
    provenance: { source_ids: item.source_ids, sources, verified_at: item.verified_at },
    verified_at: item.verified_at,
  };
}

export function buildDatabaseSnapshot(allMarkets, researchBatches) {
  if (!Array.isArray(allMarkets) || !allMarkets.length) throw new Error('Canonical market dataset must not be empty');
  const marketIds = new Set();
  const snapshot = { markets: [], facts: [], events: [], vendors: [], programs: [], duplicateMarketIds: 0 };
  for (const market of allMarkets) {
    if (market.id === undefined || market.id === null || !String(market.id).trim() || !market.name || !market.slug) throw new Error('Canonical market needs id, name and slug');
    const id = String(market.id);
    if (marketIds.has(id)) { snapshot.duplicateMarketIds++; continue; }
    marketIds.add(id);
    snapshot.markets.push({
      id, slug: market.slug, name: market.name, city: market.location?.city ?? null,
      state: market.location?.state ?? null, country: market.country ?? null, country_code: market.country_code ?? null,
      latitude: market.suppress_map ? null : market.location?.coordinates?.latitude ?? null,
      longitude: market.suppress_map ? null : market.location?.coordinates?.longitude ?? null, record: market,
    });
    const fp = market.first_party ?? {};
    for (const [collection, items] of Object.entries({ events: fp.events ?? [], vendors: fp.vendors?.roster ?? [], programs: fp.programs ?? [] })) {
      const seen = new Set();
      for (const item of items) {
        const row = sourcedRow(market, item, collection, seen);
        const value = item.value;
        if (collection === 'events') {
          const start = projectEventTime(value.start);
          const end = projectEventTime(value.end);
          snapshot.events.push({ ...row, kind: value.kind ?? 'other', url: value.url ?? null,
            source_start: start.source, source_end: end.source, start_precision: start.precision, end_precision: end.precision,
            start_date: start.date, end_date: end.date, starts_at: start.timestamp, ends_at: end.timestamp });
        } else if (collection === 'vendors') {
          const contextIds = [...new Set([fp.vendors?.roster_context, fp.vendors?.attendance_is_dynamic]
            .flatMap((node) => node?.source_ids ?? []))];
          const contextSources = contextIds.map((sourceId) => {
            const source = market.enrichment?.sources?.find((entry) => entry.id === sourceId);
            if (!source) throw new Error(`${id} vendor context references unknown source ${sourceId}`);
            return source;
          });
          snapshot.vendors.push({ ...row, website: value.website ?? null, social_url: value.social_url ?? null,
            categories: value.categories ?? [], seasonal: value.seasonal ?? null,
            provenance: { ...row.provenance, roster_context: fp.vendors?.roster_context ?? null,
              attendance_is_dynamic: fp.vendors?.attendance_is_dynamic ?? null,
              attendance_note: value.attendance_note ?? null, context_sources: contextSources } });
        } else {
          snapshot.programs.push({ ...row, kind: value.kind ?? 'other', eligibility: value.eligibility ?? null, url: value.url ?? null });
        }
      }
    }
  }
  for (const { file, records } of researchBatches) {
    if (!Array.isArray(records)) throw new Error(`${file} must be an array`);
    for (const record of records) {
      if (!marketIds.has(String(record.id))) throw new Error(`${file} refers to non-canonical market ${record.id}`);
      for (const source of record.sources ?? []) for (const field of source.fields ?? []) {
        const value = field.split('.').reduce((entry, key) => entry?.[key], record);
        if (value === undefined) continue;
        snapshot.facts.push({ market_id: String(record.id), field, value, source_url: source.url ?? null,
          source_title: source.title ?? null, verified_at: record.verified_at ?? null, batch: file });
      }
    }
  }
  return snapshot;
}
