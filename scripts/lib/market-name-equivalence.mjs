/**
 * Source publishers can change typography without renaming the market.
 * Preserve identity-bearing text: no case folding, accent removal, punctuation
 * deletion, word reordering, or compatibility/confusable-character folding.
 */
export function normalizeMarketNameTypography(value) {
  if (typeof value !== 'string') return null;
  return value
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function marketNamesEquivalent(left, right) {
  const normalizedLeft = normalizeMarketNameTypography(left);
  const normalizedRight = normalizeMarketNameTypography(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}
