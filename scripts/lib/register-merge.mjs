/**
 * Register batches (`data/enrichment/register-*.json`) carry facts read from
 * public registers and from a market's own home page: contact links and the
 * USDA SNAP flag. Unlike research batches they may name a market that already
 * has research; they only ever fill a gap. Researched values always win.
 */

import { formatUsPhone, socialPlatform } from './register-match.mjs';

export const REGISTER_FIELDS = new Set([
  'contact.websites',
  'contact.social_media',
  'contact.phone_numbers',
  'payment.food_assistance.snap',
]);

const TOP_LEVEL = new Set(['id', 'market_name', 'verified_at', 'verification_scope', 'contact', 'payment', 'sources']);

/** Problems that make a register record unusable; empty when it is fine. */
export function registerRecordProblems(record) {
  const problems = [];
  for (const key of Object.keys(record ?? {})) {
    if (!TOP_LEVEL.has(key)) problems.push(`unsupported key ${key}`);
  }
  for (const key of Object.keys(record?.contact ?? {})) {
    if (!REGISTER_FIELDS.has(`contact.${key}`)) problems.push(`unsupported key contact.${key}`);
  }
  const payment = record?.payment ?? {};
  if (Object.keys(payment).some((key) => key !== 'food_assistance')) problems.push('unsupported payment key');
  const assistance = payment.food_assistance ?? {};
  if (Object.keys(assistance).some((key) => key !== 'snap')) problems.push('unsupported food_assistance key');
  if ('snap' in assistance && assistance.snap !== true) problems.push('snap can only be true');
  for (const source of record?.sources ?? []) {
    for (const field of source.fields ?? []) {
      if (!REGISTER_FIELDS.has(field)) problems.push(`source cites non-register field ${field}`);
    }
  }
  return problems;
}

const phoneKey = (value) => formatUsPhone(value) ?? String(value).replace(/\D/g, '');

/**
 * Fold a register record into the research record for the same market.
 * Returns the merged record, or `existing` untouched when the register adds
 * nothing. Sources are kept only for the fields they actually supplied.
 */
export function mergeRegisterRecord(existing, register) {
  const added = new Set();
  const contact = { ...(existing.contact ?? {}) };

  if (register.contact?.websites?.length && !contact.websites?.length) {
    contact.websites = [...register.contact.websites];
    added.add('contact.websites');
  }
  if (register.contact?.phone_numbers?.length) {
    const have = new Set((contact.phone_numbers ?? []).map(phoneKey));
    if (!have.size) {
      contact.phone_numbers = [...register.contact.phone_numbers];
      added.add('contact.phone_numbers');
    }
  }
  if (register.contact?.social_media?.length) {
    const current = contact.social_media ?? [];
    const projected = (existing.first_party?.contact?.social_profiles ?? []).map((item) => item.value?.url);
    const platforms = new Set([...current, ...projected].map(socialPlatform).filter(Boolean));
    const fresh = register.contact.social_media.filter((url) => {
      const platform = socialPlatform(url);
      if (!platform || platforms.has(platform)) return false;
      platforms.add(platform);
      return true;
    });
    if (fresh.length) {
      contact.social_media = [...current, ...fresh];
      added.add('contact.social_media');
    }
  }

  let payment = existing.payment;
  if (
    register.payment?.food_assistance?.snap === true &&
    existing.payment?.food_assistance?.snap === undefined
  ) {
    payment = {
      ...(existing.payment ?? {}),
      food_assistance: { ...(existing.payment?.food_assistance ?? {}), snap: true },
    };
    added.add('payment.food_assistance.snap');
  }

  if (!added.size) return existing;

  const sources = [...existing.sources];
  for (const source of register.sources) {
    const fields = source.fields.filter((field) => added.has(field));
    if (!fields.length) continue;
    const href = new URL(source.url).href;
    const index = sources.findIndex((candidate) => new URL(candidate.url).href === href);
    if (index === -1) sources.push({ ...source, fields });
    else sources[index] = { ...sources[index], fields: [...new Set([...(sources[index].fields ?? []), ...fields])] };
  }

  return {
    ...existing,
    ...(Object.keys(contact).length ? { contact } : {}),
    ...(payment ? { payment } : {}),
    verified_at: [existing.verified_at, register.verified_at].sort().at(-1),
    sources,
  };
}
