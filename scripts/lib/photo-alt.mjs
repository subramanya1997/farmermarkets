// House rules for market photo alt text: "<market name>, <what is in the
// picture>", plain words, no en or em dashes (see clean() in src/lib/geo.ts).

const MARKETING = /\b(vibrant|bustling|charming|delicious|stunning|beautiful|picturesque|abundan(?:ce|t)|array of|plethora|showcas(?:e|es|ing)|nestled)\b/i;
const FRAMING = /^[^,]*,\s*(?:a |an )?(?:photo|image|picture|photograph|snapshot) (?:of|showing)\b/i;

export const MAX_ALT_LENGTH = 150;

/** The market name as it opens an alt: a " - Branch" suffix becomes "(Branch)"
 * so the comma after the name stays the only break. */
export function altMarketName(name) {
  return normalizeAlt(String(name ?? '').replace(/\s+[-\u2013\u2014]\s+(.+)$/, ' ($1)'));
}

export function normalizeAlt(value) {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    // A dash used as a pause becomes a comma; a dash inside a word stays.
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/\s+([,.])/g, '$1')
    .replace(/,{2,}/g, ',')
    .replace(/[.!\s]+$/, '')
    .trim();
}

export function checkAlt(alt, marketName) {
  const problems = [];
  if (!alt) return ['empty'];
  if (!alt.toLowerCase().startsWith(`${altMarketName(marketName).toLowerCase()},`)) problems.push('market-name');
  // A long listed name should not push an otherwise tight alt over the limit.
  if (alt.length > Math.max(MAX_ALT_LENGTH, altMarketName(marketName).length + 110)) problems.push('too-long');
  const description = alt.slice(alt.indexOf(',') + 1).trim();
  if (description.length < 15) problems.push('too-short');
  if (/[\u2013\u2014]/.test(alt)) problems.push('dash');
  if (/[;!]/.test(description)) problems.push('punctuation');
  if (FRAMING.test(alt)) problems.push('photo-of');
  if (MARKETING.test(alt)) problems.push('marketing-word');
  return problems;
}
