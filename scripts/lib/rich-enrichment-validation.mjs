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
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) fail(`${label} must be http(s)`);
  } catch {
    fail(`${label} must be a valid URL`);
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

function validateSpecialRichFacts(firstParty, label, fail) {
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
  validateSpecialRichFacts(record.first_party, `${label}.first_party`, fail);
}
