/** Shared conservative readers for legacy schedule text. Rich sourced schedules
 * remain authoritative; unsupported qualifiers must never become weekly hours. */
import { clean } from './geo.ts';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type Weekday = (typeof WEEKDAY_NAMES)[number];

/**
 * Weekday spellings that appear in the data: English (full, plural, 3-letter)
 * plus French and Dutch, which the Brussels and French market feeds ship, and
 * German/Spanish/Italian for the smaller European sources.
 */
const WEEKDAY_ALIASES: Record<Weekday, string[]> = {
  Monday: ['monday', 'mondays', 'mon', 'lundi', 'lundis', 'maandag', 'montag', 'lunes', 'lunedi'],
  Tuesday: ['tuesday', 'tuesdays', 'tue', 'tues', 'mardi', 'mardis', 'dinsdag', 'dienstag', 'martes', 'martedi'],
  Wednesday: [
    'wednesday',
    'wednesdays',
    'wed',
    'weds',
    'mercredi',
    'mercredis',
    'woensdag',
    'mittwoch',
    'miercoles',
    'mercoledi',
  ],
  Thursday: [
    'thursday',
    'thursdays',
    'thu',
    'thur',
    'thurs',
    'jeudi',
    'jeudis',
    'donderdag',
    'donnerstag',
    'jueves',
    'giovedi',
  ],
  Friday: ['friday', 'fridays', 'fri', 'vendredi', 'vendredis', 'vrijdag', 'freitag', 'viernes', 'venerdi'],
  Saturday: [
    'saturday',
    'saturdays',
    'sat',
    'samedi',
    'samedis',
    'zaterdag',
    'samstag',
    'sonnabend',
    'sabado',
    'sabato',
  ],
  Sunday: ['sunday', 'sundays', 'sun', 'dimanche', 'dimanches', 'zondag', 'sonntag', 'domingo', 'domenica'],
};

const WEEKDAY_BY_ALIAS = new Map<string, number>();
for (const [index, day] of WEEKDAY_NAMES.entries()) {
  for (const alias of WEEKDAY_ALIASES[day]) WEEKDAY_BY_ALIAS.set(alias, index);
}

// Longest alias first so "saturdays" never matches as "sat" + leftovers.
const WEEKDAY_ALTERNATION = [...WEEKDAY_BY_ALIAS.keys()]
  .sort((left, right) => right.length - left.length)
  .join('|');
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_ALTERNATION})\\b`, 'g');
const WEEKDAY_RANGE_RE = new RegExp(
  `\\b(${WEEKDAY_ALTERNATION})\\b\\s*(?:-|–|—|to|through|thru|t\\/m|au)\\s*\\b(${WEEKDAY_ALTERNATION})\\b`,
  'g'
);
const EVERY_DAY_RE = /\b(daily|every ?day|7 days a week|tous les jours|elke dag)\b/;

/** Lower-case and strip accents so "Mercredi" and "mercredi" are one token. */
function foldForMatching(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Every weekday named anywhere in a free-text schedule string, in week order.
 *
 * Handles the three shapes the data uses: single names ("saturday"), inclusive
 * ranges that wrap the week ("Mon-Sat", "Friday to Sunday"), and "Daily".
 */
export function weekdaysFromText(value?: string | null): Weekday[] {
  const text = foldForMatching(clean(value));
  if (!text) return [];

  const found = new Set<number>();
  if (EVERY_DAY_RE.test(text)) {
    return [...WEEKDAY_NAMES];
  }

  for (const match of text.matchAll(WEEKDAY_RANGE_RE)) {
    const start = WEEKDAY_BY_ALIAS.get(match[1]);
    const end = WEEKDAY_BY_ALIAS.get(match[2]);
    if (start === undefined || end === undefined) continue;
    const span = (end - start + 7) % 7;
    for (let step = 0; step <= span; step += 1) found.add((start + step) % 7);
  }

  for (const match of text.matchAll(WEEKDAY_RE)) {
    const index = WEEKDAY_BY_ALIAS.get(match[1]);
    if (index !== undefined) found.add(index);
  }

  return WEEKDAY_NAMES.filter((_day, index) => found.has(index));
}

/**
 * One clock time: `9`, `9:30`, `09:00:00`, `07h30`, `9am`, `6:00 a.m.`.
 * Captures hour, minutes and the meridiem letter; the seconds the European
 * feeds ship are matched but discarded.
 */
const TIME_TOKEN = String.raw`(\d{1,2})(?:\s*[:h.]\s*(\d{2}))?(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?`;
const TIME_RANGE_RE = new RegExp(
  `${TIME_TOKEN}\\s*(?:-|–|—|to|until|till|tot|tp)\\s*${TIME_TOKEN}`,
  'i'
);

interface ParsedTime {
  hour: number;
  minute: number;
  meridiem?: 'a' | 'p';
}

function readTime(hour: string, minute?: string, meridiem?: string): ParsedTime | undefined {
  const hours = Number(hour);
  const minutes = minute === undefined ? 0 : Number(minute);
  if (!Number.isFinite(hours) || hours > 24 || minutes > 59) return undefined;
  return {
    hour: hours,
    minute: minutes,
    meridiem: meridiem ? (meridiem.toLowerCase() as 'a' | 'p') : undefined,
  };
}

function toMinutes({ hour, minute, meridiem }: ParsedTime, override?: 'a' | 'p'): number {
  const mark = meridiem ?? override;
  let hours = hour;
  if (mark === 'p' && hours < 12) hours += 12;
  if (mark === 'a' && hours === 12) hours = 0;
  return hours * 60 + minute;
}

function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export interface HourRange {
  /** 24-hour `HH:MM`. */
  opens: string;
  closes: string;
}

/**
 * The opening times stated in one free-text schedule string, as 24h `HH:MM`.
 *
 * Returns `undefined` — never a guess — when the string states no times
 * ("saturday"), when what looks like a range is really a date span
 * ("June 1-October 31"), or when the two times do not make a forward-running
 * window ("6:00 a.m. to 2:00 a.m." wraps midnight and cannot be expressed as
 * one `OpeningHoursSpecification`).
 */
export function parseHourRange(value?: string | null): HourRange | undefined {
  const text = clean(value);
  if (!text) return undefined;

  const match = TIME_RANGE_RE.exec(text);
  if (!match) return undefined;

  const start = readTime(match[1], match[2], match[3]);
  const end = readTime(match[4], match[5], match[6]);
  if (!start || !end) return undefined;

  // With no meridiem on either side, only a pair that both carry minutes is
  // safe to read as 24h ("06:00-13:30"). This is the rule that stops
  // "May 2-October 31" and "June 1-5" being read as 02:00–31:00.
  if (!start.meridiem && !end.meridiem && (match[2] === undefined || match[5] === undefined)) {
    return undefined;
  }

  // "1-5pm" and "9am-1" each state the meridiem once. Borrow it from the other
  // side, and fall back to the opposite half of the day when borrowing would
  // run the window backwards ("9-1pm" is 09:00–13:00, not 21:00–13:00).
  let opens = toMinutes(start);
  let closes = toMinutes(end);
  if (!start.meridiem && end.meridiem) {
    const borrowed = toMinutes(start, end.meridiem);
    opens = borrowed < closes ? borrowed : toMinutes(start, end.meridiem === 'p' ? 'a' : 'p');
  } else if (start.meridiem && !end.meridiem) {
    const borrowed = toMinutes(end, start.meridiem);
    closes = borrowed > opens ? borrowed : toMinutes(end, start.meridiem === 'p' ? 'a' : 'p');
  }

  if (closes <= opens || closes > 24 * 60) return undefined;
  return { opens: formatClock(opens), closes: formatClock(closes) };
}

export interface LegacyScheduleWindow {
  days: Weekday[];
  hours?: HourRange;
  /** Unmodified context for season/exception handling and visible copy. */
  text: string;
  hourText?: string;
  unsafe?: boolean;
}

const CLAUSE_BOUNDARY = new RegExp(`[,;|]\\s*(?=(?:${WEEKDAY_ALTERNATION}|daily|every day)\\b)`, 'gi');
const CLOSED = /\b(?:closed|not open|ferme|gesloten|cerrado)\b/i;
const NON_WEEKLY = /\b(?:every other|alternate|alternating|first|second|third|fourth|last|1st|2nd|3rd|4th|monthly|once a month)\b/i;

/** Opening clauses only. Do not promote closure mentions into trading days. */
export function legacyScheduleWindows(sources: (string | null | undefined)[]): LegacyScheduleWindow[] {
  const windows: LegacyScheduleWindow[] = [];
  const unassigned: { hours: HourRange; text: string; hourText: string }[] = [];
  for (const source of sources) {
    for (const text of scheduleClauses(clean(source))) {
      const days = weekdaysFromText(text);
      const ranges = hourRangeTexts(text).map((hourText) => ({ hours: parseHourRange(hourText)!, hourText }));
      // Mixed opening/exception text is retained for prose but omitted from
      // precise structured hours below. A closure-only clause is never opening.
      if (CLOSED.test(text) && !ranges.length) continue;
      if (NON_WEEKLY.test(text) || hasSingleCalendarDate(text)) continue;
      if (ranges.length && days.length) {
        const firstRangeEnd = text.indexOf(ranges[0].hourText) + ranges[0].hourText.length;
        const unsafe = (ranges.length > 1 || CLOSED.test(text)) && weekdaysFromText(text.slice(firstRangeEnd)).length > 0;
        for (const range of ranges) windows.push({ days, ...range, text, ...(unsafe ? { unsafe: true } : {}) });
      } else if (days.length) {
        windows.push({ days, text });
      } else if (ranges.length && !hasScheduleExceptions(text)) {
        for (const range of ranges) unassigned.push({ ...range, text });
      }
    }
  }
  // USDA often puts weekdays and a single common time in separate fields.
  // Only pair them when there is no competing day-specific time window.
  if (unassigned.length === 1 && !windows.some((window) => window.hours)) {
    for (const window of windows) {
      window.hours = unassigned[0].hours;
      window.hourText = unassigned[0].hourText;
      window.text = `${window.text} ${unassigned[0].text}`;
    }
  }
  const timedDays = new Set(windows.filter((window) => window.hours).flatMap((window) => window.days));
  return windows.filter((window) => window.hours || window.days.some((day) => !timedDays.has(day)));
}

/** Qualifiers that cannot safely be encoded as ordinary weekly hours. */
export function hasScheduleExceptions(text: string): boolean {
  return CLOSED.test(text) || NON_WEEKLY.test(text) || /\b(?:except|excluding|weather permitting|by appointment|holidays|canceled|cancelled)\b/i.test(text);
}

/** The actual clock ranges, excluding ambiguous date-like number pairs. */
export function hourRangeTexts(text: string): string[] {
  return [...text.matchAll(new RegExp(TIME_RANGE_RE.source, 'gi'))]
    .map((match) => match[0]).filter((value) => Boolean(parseHourRange(value)));
}

export function hasSeasonContext(text: string): boolean {
  return /\b(?:january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec|spring|summer|fall|autumn|winter|20\d{2})\b/i.test(text);
}

/** Source labels remain available even when recurrence cannot be made precise. */
export function legacyScheduleLabels(sources: (string | null | undefined)[]): string[] {
  return [...new Set(sources.flatMap((source) => scheduleClauses(clean(source)))
    .map(clean).filter((text) => weekdaysFromText(text).length && hourRangeTexts(text).length))];
}

export function hasNonWeeklyRecurrence(text: string): boolean {
  return NON_WEEKLY.test(text);
}

const CALENDAR_MONTH = 'january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec';
const NAMED_CALENDAR_DATE = new RegExp(`\\b(?:${CALENDAR_MONTH})\\.?\\s*\\d{1,2}(?!\\d)(?:st|nd|rd|th)?\\s*,?\\s*20\\d{2}\\b`, 'gi');
const DATE_RANGE_PREFIX = new RegExp(`\\b(?:${CALENDAR_MONTH})\\.?\\s*(?:\\d{1,2}(?:st|nd|rd|th)?)?(?:\\s*,?\\s*20\\d{2})?\\s*(?:-|–|—|to|through|thru)\\s*$`, 'i');
const DATE_RANGE_SUFFIX = new RegExp(`^\\s*(?:-|–|—|to|through|thru)\\s*(?:${CALENDAR_MONTH})\\b`, 'i');

/** A single announced date is not evidence of a weekly recurrence. */
export function hasSingleCalendarDate(text: string): boolean {
  for (const match of text.matchAll(NAMED_CALENDAR_DATE)) {
    // "June 17-August 26, 2026" is a season, not one August event.
    if (!DATE_RANGE_PREFIX.test(text.slice(0, match.index)) && !DATE_RANGE_SUFFIX.test(text.slice(match.index! + match[0].length))) return true;
  }
  const withoutIsoRanges = text.replace(/\b20\d{2}-\d{2}-\d{2}\s*(?:-|–|—|to|through|thru)\s*20\d{2}-\d{2}-\d{2}\b/gi, '');
  return /\b20\d{2}-\d{2}-\d{2}\b/.test(withoutIsoRanges);
}

/** Commas in a weekday list are not boundaries until that slot has hours. */
function scheduleClauses(source: string): string[] {
  const clauses: string[] = [];
  let start = 0;
  for (const match of source.matchAll(CLAUSE_BOUNDARY)) {
    const preceding = source.slice(start, match.index);
    if (hourRangeTexts(preceding).length || CLOSED.test(preceding)) {
      clauses.push(clean(preceding));
      start = match.index + match[0].length;
    }
  }
  clauses.push(clean(source.slice(start)));
  return clauses.filter(Boolean);
}
