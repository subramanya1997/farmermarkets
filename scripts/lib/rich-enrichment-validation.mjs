const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function realIsoDate(value) {
  if (!ISO_DATE.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function requireHttpUrl(value, label, fail) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a valid URL`);
  }
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail(`${label} must be an absolute public http(s) URL`);
  }
}

function validateSourceReference(sourceId, sourcesById, verifiedAt, label, fail) {
  const source = sourcesById.get(sourceId);
  if (!source) fail(`${label} references unknown source id ${sourceId}`);
  if (source.kind !== 'first_party' || source.scope !== 'market') {
    fail(`${label} source ${sourceId} must be first_party and market scoped`);
  }
  if (!realIsoDate(source.accessed_at)) fail(`${label} source ${sourceId} needs a real accessed_at date`);
  if (source.accessed_at > verifiedAt) fail(`${label} predates source ${sourceId}`);
  requireHttpUrl(source.url, `${label} source ${sourceId}.url`, fail);
}

function validateSourcedNode(node, label, sourcesById, fail) {
  if (!isPlainObject(node) || !Object.hasOwn(node, 'value')) fail(`${label} must be a sourced value`);
  if (!Array.isArray(node.source_ids) || node.source_ids.length === 0) {
    fail(`${label}.source_ids must be a non-empty array`);
  }
  if (new Set(node.source_ids).size !== node.source_ids.length) fail(`${label}.source_ids must be unique`);
  if (!realIsoDate(node.verified_at)) fail(`${label}.verified_at must be a real YYYY-MM-DD date`);
  for (const sourceId of node.source_ids) {
    if (typeof sourceId !== 'string' || !sourceId.trim()) fail(`${label}.source_ids must contain strings`);
    validateSourceReference(sourceId, sourcesById, node.verified_at, label, fail);
  }
  if (Object.hasOwn(node, 'id') && !ITEM_ID.test(node.id)) {
    fail(`${label}.id must be stable kebab-case`);
  }
}

function walkRichFacts(value, label, sourcesById, fail, usedSourceIds) {
  if (Array.isArray(value)) {
    const ids = new Set();
    value.forEach((item, index) => {
      const itemLabel = `${label}[${index}]`;
      validateSourcedNode(item, itemLabel, sourcesById, fail);
      if (!Object.hasOwn(item, 'id')) fail(`${itemLabel}.id is required`);
      if (ids.has(item.id)) fail(`${label} contains duplicate item id ${item.id}`);
      ids.add(item.id);
      item.source_ids.forEach((sourceId) => usedSourceIds.add(sourceId));
    });
    return;
  }
  if (!isPlainObject(value)) fail(`${label} must be an object or sourced collection`);
  if (Object.hasOwn(value, 'source_ids') || Object.hasOwn(value, 'verified_at') || Object.hasOwn(value, 'value')) {
    validateSourcedNode(value, label, sourcesById, fail);
    value.source_ids.forEach((sourceId) => usedSourceIds.add(sourceId));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    walkRichFacts(entry, `${label}.${key}`, sourcesById, fail, usedSourceIds);
  }
}

function validateSchedule(item, label, fail) {
  const schedule = item.value;
  if (!isPlainObject(schedule)) fail(`${label}.value must be an object`);
  if (!LOCAL_TIME.test(schedule.opens) || !LOCAL_TIME.test(schedule.closes)) {
    fail(`${label} opens/closes must use local HH:mm`);
  }
  if (schedule.closes <= schedule.opens) fail(`${label}.closes must be after opens`);
  if (schedule.start_date !== undefined && !realIsoDate(schedule.start_date)) fail(`${label}.start_date is invalid`);
  if (schedule.end_date !== undefined && !realIsoDate(schedule.end_date)) fail(`${label}.end_date is invalid`);
  if (schedule.start_date && schedule.end_date && schedule.end_date < schedule.start_date) {
    fail(`${label} has a backwards date range`);
  }
  const recurrence = schedule.recurrence;
  if (!isPlainObject(recurrence) || !['weekly', 'monthly', 'dates'].includes(recurrence.kind)) {
    fail(`${label}.recurrence is invalid`);
  }
  if (recurrence.kind === 'dates') {
    if (!Array.isArray(recurrence.dates) || !recurrence.dates.length || recurrence.dates.some((date) => !realIsoDate(date))) {
      fail(`${label}.recurrence.dates must contain real dates`);
    }
  } else if (!Array.isArray(recurrence.weekdays) || !recurrence.weekdays.length) {
    fail(`${label}.recurrence.weekdays must not be empty`);
  }
}

function requireShape(value, allowed, label, fail) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label} contains unsupported field ${key}`);
}

function requireText(value, label, fail, maxLength = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) fail(`${label} must be non-empty text at most ${maxLength} characters`);
}

function realEventDate(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match || !realIsoDate(match[1]) || match[1].startsWith('0000')) return false;
  if (match[2] === undefined) return true;
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) return false;
  if (match[5] && match[5] !== 'Z') {
    const [hour, minute] = match[5].slice(1).split(':').map(Number);
    if (hour > 14 || minute > 59 || hour === 14 && minute !== 0) return false;
  }
  return true;
}

function requireSourceField(item, field, sourcesById, label, fail) {
  for (const sourceId of item.source_ids) {
    const source = sourcesById.get(sourceId);
    const supports = Array.isArray(source.fields) && source.fields.some((entry) => typeof entry === 'string' &&
      (entry === field || field.startsWith(`${entry}.`)));
    if (!supports) fail(`${label} source ${sourceId} does not declare support for ${field}`);
  }
}

function validateEvent(item, label, sourcesById, fail) {
  const value = item.value;
  requireShape(value, ['name', 'kind', 'start', 'end', 'description', 'url', 'local_hours', 'published_hours', 'venue', 'status'], `${label}.value`, fail);
  requireText(value.name, `${label}.value.name`, fail, 300);
  if (!['music', 'workshop', 'kids', 'festival', 'special_market', 'other'].includes(value.kind)) fail(`${label}.value.kind is invalid`);
  for (const key of ['start', 'end']) if (value[key] !== undefined && !realEventDate(value[key])) fail(`${label}.value.${key} must be a real ISO calendar date or datetime`);
  if (value.end !== undefined && value.start === undefined) fail(`${label}.value.end requires start`);
  if (value.start && value.end) {
    const zoned = /T.*(?:Z|[+-]\d{2}:\d{2})$/;
    const backwards = zoned.test(value.start) && zoned.test(value.end)
      ? Date.parse(value.end) < Date.parse(value.start)
      : value.end.slice(0, 10) < value.start.slice(0, 10) ||
        value.start.includes('T') && value.end.includes('T') && !zoned.test(value.start) && !zoned.test(value.end) && value.end < value.start;
    if (backwards) fail(`${label}.value has a backwards event date range`);
  }
  for (const key of ['description', 'venue']) if (value[key] !== undefined) requireText(value[key], `${label}.value.${key}`, fail);
  if (value.published_hours !== undefined) requireText(value.published_hours, `${label}.value.published_hours`, fail, 200);
  if (value.url !== undefined) requireHttpUrl(value.url, `${label}.value.url`, fail);
  if (value.status !== undefined && !['scheduled', 'cancelled', 'postponed'].includes(value.status)) fail(`${label}.value.status is invalid`);
  if (value.local_hours !== undefined) {
    requireShape(value.local_hours, ['opens', 'closes'], `${label}.value.local_hours`, fail);
    if (!LOCAL_TIME.test(value.local_hours.opens) || !LOCAL_TIME.test(value.local_hours.closes) || value.local_hours.closes <= value.local_hours.opens) fail(`${label}.value.local_hours must be a forward local HH:mm window`);
  }
  requireSourceField(item, 'first_party.events', sourcesById, label, fail);
}

function validateVendors(vendors, label, sourcesById, fail) {
  if (!vendors) return;
  requireShape(vendors, ['count', 'directory_url', 'weekly_roster_url', 'attendance_is_dynamic', 'roster_context', 'roster'], label, fail);
  if (vendors.count) {
    const value = vendors.count.value;
    requireShape(value, ['value', 'qualifier', 'as_of'], `${label}.count.value`, fail);
    if (!Number.isInteger(value.value) || value.value <= 0) fail(`${label}.count.value.value must be a positive integer`);
    if (value.qualifier !== undefined) requireText(value.qualifier, `${label}.count.value.qualifier`, fail, 200);
    if (value.as_of !== undefined && !realIsoDate(value.as_of)) fail(`${label}.count.value.as_of is invalid`);
  }
  const context = vendors.roster_context;
  if (context) {
    const value = context.value;
    requireShape(value, ['label', 'as_of', 'start_date', 'end_date', 'non_exhaustive'], `${label}.roster_context.value`, fail);
    if (!Object.keys(value).length) fail(`${label}.roster_context.value must not be empty`);
    if (value.label !== undefined) requireText(value.label, `${label}.roster_context.value.label`, fail, 200);
    for (const key of ['as_of', 'start_date', 'end_date']) if (value[key] !== undefined && !realIsoDate(value[key])) fail(`${label}.roster_context.value.${key} is invalid`);
    if (value.as_of && value.as_of > context.verified_at) fail(`${label}.roster_context snapshot cannot be after its verified_at date`);
    if (value.start_date && value.end_date && value.end_date < value.start_date) fail(`${label}.roster_context has a backwards period`);
    if (value.non_exhaustive !== undefined && typeof value.non_exhaustive !== 'boolean') fail(`${label}.roster_context.value.non_exhaustive must be boolean`);
    requireSourceField(context, 'first_party.vendors.roster_context', sourcesById, label, fail);
  }
  if (vendors.attendance_is_dynamic && typeof vendors.attendance_is_dynamic.value !== 'boolean') fail(`${label}.attendance_is_dynamic.value must be boolean`);
  for (const key of ['directory_url', 'weekly_roster_url']) if (vendors[key]) {
    requireHttpUrl(vendors[key].value, `${label}.${key}.value`, fail);
    requireSourceField(vendors[key], `first_party.vendors.${key}`, sourcesById, label, fail);
  }
  for (const [index, item] of (vendors.roster ?? []).entries()) {
    const value = item.value;
    const itemLabel = `${label}.roster[${index}]`;
    requireShape(value, ['name', 'categories', 'website', 'social_url', 'seasonal', 'attendance_note'], `${itemLabel}.value`, fail);
    requireText(value.name, `${itemLabel}.value.name`, fail, 300);
    if (value.categories !== undefined) {
      if (!Array.isArray(value.categories)) fail(`${itemLabel}.value.categories must be an array`);
      value.categories.forEach((category, categoryIndex) => requireText(category, `${itemLabel}.value.categories[${categoryIndex}]`, fail, 200));
    }
    for (const key of ['website', 'social_url']) if (value[key] !== undefined) requireHttpUrl(value[key], `${itemLabel}.value.${key}`, fail);
    if (value.seasonal !== undefined && typeof value.seasonal !== 'boolean') fail(`${itemLabel}.value.seasonal must be boolean`);
    if (value.attendance_note !== undefined) requireText(value.attendance_note, `${itemLabel}.value.attendance_note`, fail);
    requireSourceField(item, 'first_party.vendors.roster', sourcesById, itemLabel, fail);
  }
}

function validateSpecialRichFacts(firstParty, label, fail, sourcesById) {
  const schedules = firstParty.operations?.schedules ?? [];
  if (schedules.length && !firstParty.operations?.timezone) {
    fail(`${label}.operations.timezone is required for structured schedules`);
  }
  for (const [index, item] of schedules.entries()) validateSchedule(item, `${label}.operations.schedules[${index}]`, fail);

  if (firstParty.operations?.timezone) {
    const timezone = firstParty.operations.timezone.value;
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
    } catch {
      fail(`${label}.operations.timezone is not an IANA timezone`);
    }
  }
  const status = firstParty.operations?.status?.value;
  if (status && ['temporarily_closed', 'permanently_closed'].includes(status.value) && !realIsoDate(status.effective_date)) {
    fail(`${label}.operations.status requires an effective_date for closure`);
  }

  for (const [index, incentive] of (firstParty.payments?.incentives ?? []).entries()) {
    const value = incentive.value;
    for (const key of ['input_amount', 'benefit_amount', 'maximum_amount']) {
      if (value[key] !== undefined && (!Number.isFinite(value[key]) || value[key] < 0)) {
        fail(`${label}.payments.incentives[${index}].value.${key} must be nonnegative`);
      }
    }
    if ((value.input_amount === undefined) !== (value.benefit_amount === undefined)) {
      fail(`${label}.payments.incentives[${index}] needs both input and benefit amounts`);
    }
    if (value.url) requireHttpUrl(value.url, `${label}.payments.incentives[${index}].value.url`, fail);
  }

  const count = firstParty.vendors?.count?.value.value;
  if (count !== undefined && (!Number.isInteger(count) || count <= 0)) {
    fail(`${label}.vendors.count must be a positive integer`);
  }
  const roster = firstParty.vendors?.roster ?? [];
  if (count !== undefined && roster.length > count) fail(`${label}.vendors.count is smaller than its roster`);
  validateVendors(firstParty.vendors, `${label}.vendors`, sourcesById, fail);
  for (const [index, event] of (firstParty.events ?? []).entries()) validateEvent(event, `${label}.events[${index}]`, sourcesById, fail);

  for (const [group, values] of Object.entries(firstParty.languages ?? {})) {
    for (const [index, item] of values.entries()) {
      try {
        new Intl.Locale(item.value.tag);
      } catch {
        fail(`${label}.languages.${group}[${index}] has an invalid language tag`);
      }
    }
  }

  const newsletter = firstParty.contact?.newsletter?.value.signup_url;
  if (newsletter) requireHttpUrl(newsletter, `${label}.contact.newsletter.value.signup_url`, fail);
  for (const [index, social] of (firstParty.contact?.social_profiles ?? []).entries()) {
    requireHttpUrl(social.value.url, `${label}.contact.social_profiles[${index}].value.url`, fail);
  }
  for (const [index, faq] of (firstParty.faq_facts ?? []).entries()) {
    const answer = faq.value.answer?.trim();
    if (!answer || answer.length > 300 || /\?\s*$/.test(answer)) {
      fail(`${label}.faq_facts[${index}].value.answer must be declarative and at most 300 characters`);
    }
    if (faq.value.expires_on !== undefined && !realIsoDate(faq.value.expires_on)) {
      fail(`${label}.faq_facts[${index}].value.expires_on is invalid`);
    }
  }
}

export function validateRichEnrichment(record, label, fail) {
  if (!record.first_party) {
    if (record.schema_version !== undefined && record.schema_version !== 2) {
      fail(`${label}.schema_version must be 2`);
    }
    return;
  }
  if (record.schema_version !== 2) fail(`${label}.schema_version must be 2 when first_party is present`);

  const sourcesById = new Map();
  for (const [index, source] of record.sources.entries()) {
    if (!source.id) continue;
    if (!ITEM_ID.test(source.id)) fail(`${label}.sources[${index}].id must be kebab-case`);
    if (sourcesById.has(source.id)) fail(`${label}.sources contains duplicate id ${source.id}`);
    sourcesById.set(source.id, source);
  }
  const usedSourceIds = new Set();
  walkRichFacts(record.first_party, `${label}.first_party`, sourcesById, fail, usedSourceIds);
  if (!usedSourceIds.size) fail(`${label}.first_party contains no sourced facts`);
  for (const [sourceId, source] of sourcesById) {
    if (source.kind === 'first_party' && !usedSourceIds.has(sourceId)) {
      fail(`${label}.sources contains unused first-party source ${sourceId}`);
    }
  }
  validateSpecialRichFacts(record.first_party, `${label}.first_party`, fail, sourcesById);
}
