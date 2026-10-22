/**
 * Copy helpers shared by the four topic pages (`src/lib/topicPage.ts`).
 *
 * Everything here is a pure function of numbers and strings — no data layer,
 * no Next.js, so the rules the topic pages depend on (a title that fits the
 * SERP, a description that fits the snippet, one spelling for opening times)
 * are unit tested directly in `src/lib/topicCopy.test.ts`.
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

/**
 * "47 states and DC", "1 state", "DC". The topic pages cover the 50 states
 * plus the District of Columbia, and DC reads wrong counted as a state.
 */
export function placesPhrase(stateCount: number, includesDc: boolean): string {
  const states = stateCount === 1 ? '1 state' : `${formatCount(stateCount)} states`;
  if (!includesDc) return states;
  return stateCount > 0 ? `${states} and DC` : 'DC';
}

function twelveHour(hour: number, minute: string): string {
  const suffix = hour >= 12 && hour < 24 ? 'pm' : 'am';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${minute && minute !== '00' ? `:${minute}` : ''}${suffix}`;
}

/**
 * One house style for an opening-times string, so "9AM-1PM", "9:00am-1:00pm"
 * and "9am-1pm" count (and read) as the same window. A 24-hour range is only
 * converted when it is unambiguous (the close is after noon); anything the
 * rules do not recognise is returned with just the dashes normalised.
 */
export function tidyHours(value: string): string {
  let text = value
    .trim()
    .replace(/\s*[\u2013\u2014]\s*/g, '-')
    .replace(/\s*-\s*/g, '-');

  const twentyFour = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(text);
  if (twentyFour) {
    const [, openHour, openMinute, closeHour, closeMinute] = twentyFour;
    const open = Number(openHour);
    const close = Number(closeHour);
    if (close > 12 && close <= 24 && open < close) {
      return `${twelveHour(open, openMinute)}-${twelveHour(close, closeMinute)}`;
    }
  }

  text = text
    .replace(/(\d)\s*([AaPp])\.?[Mm]\.?/g, (_match, digit: string, meridiem: string) =>
      `${digit}${meridiem.toLowerCase()}m`
    )
    .replace(/(\d{1,2}):00(?=[ap]m)/g, '$1');
  return text;
}
