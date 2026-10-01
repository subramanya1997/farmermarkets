import { isDeepStrictEqual } from 'node:util';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const sourced = value => object(value) && Object.hasOwn(value, 'value') && Array.isArray(value.source_ids);

/** Add independently sourced namespaces without letting file order pick a winner. */
export function mergeRichFacts(left, right, path = 'first_party') {
  if (left === undefined) return structuredClone(right);
  if (right === undefined) return structuredClone(left);
  if (sourced(left) && sourced(right)) {
    if (!isDeepStrictEqual(left.value, right.value)) throw new Error(`Conflicting rich fact ${path}`);
    return { ...left, source_ids: [...new Set([...left.source_ids, ...right.source_ids])], verified_at: [left.verified_at, right.verified_at].sort().at(-1) };
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const items = new Map(left.map(item => [item.id, structuredClone(item)]));
    for (const item of right) {
      if (!item.id) throw new Error(`Missing rich item ID ${path}`);
      items.set(item.id, items.has(item.id) ? mergeRichFacts(items.get(item.id), item, `${path}.${item.id}`) : structuredClone(item));
    }
    return [...items.values()];
  }
  if (object(left) && object(right) && !sourced(left) && !sourced(right)) {
    return Object.fromEntries([...new Set([...Object.keys(left), ...Object.keys(right)])].map(key => [key, mergeRichFacts(left[key], right[key], `${path}.${key}`)]));
  }
  if (isDeepStrictEqual(left, right)) return structuredClone(left);
  throw new Error(`Conflicting rich fact ${path}`);
}

function remapEvidence(value, aliases) {
  if (Array.isArray(value)) return value.map(item => remapEvidence(item, aliases));
  if (!object(value)) return value;
  if (sourced(value)) return { ...value, source_ids: [...new Set(value.source_ids.map(id => aliases.get(id) ?? id))] };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remapEvidence(item, aliases)]));
}

/** One canonical URL/source ID per record; every fact keeps its own checked date. */
export function mergeRichRecords(left, right) {
  const sources = new Map();
  const aliases = new Map();
  const ids = new Map();
  for (const source of [...left.sources, ...right.sources]) {
    const url = new URL(source.url).href;
    if (source.id && ids.has(source.id) && ids.get(source.id) !== url) throw new Error(`Conflicting rich source ID ${source.id}`);
    if (source.id) ids.set(source.id, url);
    const previous = sources.get(url);
    if (!previous) { sources.set(url, structuredClone(source)); continue; }
    const canonicalId = previous.id ?? source.id;
    if (source.id && canonicalId) aliases.set(source.id, canonicalId);
    if (previous.id && canonicalId) aliases.set(previous.id, canonicalId);
    const accessed = [previous.accessed_at, source.accessed_at].filter(Boolean).sort()[0];
    sources.set(url, {
      ...previous,
      ...(canonicalId ? { id: canonicalId } : {}),
      kind: previous.kind ?? source.kind,
      scope: previous.scope ?? source.scope,
      ...(accessed ? { accessed_at: accessed } : {}),
      fields: [...new Set([...previous.fields, ...source.fields])],
    });
  }
  return {
    ...left,
    schema_version: 2,
    first_party: mergeRichFacts(remapEvidence(left.first_party, aliases), remapEvidence(right.first_party, aliases)),
    verified_at: [left.verified_at, right.verified_at].sort().at(-1),
    verification_scope: 'partial',
    sources: [...sources.values()],
  };
}
