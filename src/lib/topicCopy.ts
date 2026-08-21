/**
 * Copy helpers shared by the four topic pages (`src/lib/topicPage.ts`).
 *
 * Everything here is a pure function of numbers and strings — no data layer,
 * no Next.js — so the rules the topic pages depend on (a title that fits the
 * SERP, a description that fits the snippet, an opener that stays inside the
 * 40–75 word band the city and state pages use) are unit tested directly in
 * `src/lib/topicCopy.test.ts`.
 *
 * The same discipline as the rest of the copy layer applies: a clause whose
 * input is missing is dropped, never filled in with a guess.
 */

import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from './seo.ts';

export { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH };

/** "a", "a and b", "a, b and c". */
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "8,807" — thousands separators, fixed to en-US so SSR and CSR agree. */
export function formatCount(count: number): string {
  return count.toLocaleString('en-US');
}

/** "1 farmers market" / "661 farmers markets". */
export function pluralMarkets(count: number): string {
  return count === 1 ? '1 farmers market' : `${formatCount(count)} farmers markets`;
}

/** "1 market" / "813 markets". */
export function pluralShort(count: number): string {
  return count === 1 ? '1 market' : `${formatCount(count)} markets`;
}

/**
 * `part` as a whole-number percentage of `total`.
 *
 * Returns undefined for an empty total rather than 0, so a caller drops the
 * sentence instead of publishing "0% of markets".
 */
export function sharePercent(part: number, total: number): number | undefined {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return undefined;
  return Math.round((part / total) * 100);
}

/**
 * The first candidate title that fits the SERP, in the caller's own order of
 * preference. Every topic title carries its count, so the count clause is
 * never what gets dropped — the candidates degrade by shortening the label.
 */
export function fitTitle(candidates: string[]): string {
  const fitting = candidates.find(
    (candidate) => candidate.trim().length > 0 && candidate.length <= TITLE_MAX_LENGTH
  );
  if (fitting) return fitting;

  const last = candidates.filter((candidate) => candidate.trim().length > 0).pop() ?? '';
  return last.slice(0, TITLE_MAX_LENGTH).replace(/[\s,;:.\-—]+$/, '');
}

/**
 * An answer-first meta description: the opening sentence, then as many of the
 * optional sentences as fit inside `DESCRIPTION_MAX_LENGTH`. A sentence that
 * would overflow is skipped, not truncated, so the snippet never ends mid-word.
 */
export function fitDescription(opening: string, optional: (string | undefined)[]): string {
  let description = opening.trim();
  for (const sentence of optional) {
    const next = sentence?.trim();
    if (!next) continue;
    if (`${description} ${next}`.length > DESCRIPTION_MAX_LENGTH) continue;
    description = `${description} ${next}`;
  }
  return description.replace(/\s+/g, ' ').trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * The 40–75 word opener the city and state pages use, assembled from
 * `sentences` and topped up from `closers` only when the result would
 * otherwise be too short to read as a paragraph.
 */
export function buildParagraph(
  sentences: (string | undefined)[],
  closers: (string | undefined)[] = [],
  { min = 40, max = 75 }: { min?: number; max?: number } = {}
): string {
  const paragraph: string[] = [];

  for (const sentence of sentences) {
    const next = sentence?.trim();
    if (!next) continue;
    if (paragraph.length > 0 && countWords([...paragraph, next].join(' ')) > max) break;
    paragraph.push(next);
  }

  for (const closer of closers) {
    const next = closer?.trim();
    if (!next) continue;
    if (countWords(paragraph.join(' ')) >= min) break;
    if (countWords([...paragraph, next].join(' ')) > max) continue;
    paragraph.push(next);
  }

  return paragraph.join(' ');
}
