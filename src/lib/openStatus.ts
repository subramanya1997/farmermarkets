/**
 * "Open now" / "Opens Saturday at 8am" for a market with a source-backed
 * weekly schedule and an explicitly sourced IANA timezone.
 *
 * Computed in the visitor's browser, never at build time: the page is static
 * and revalidated daily, so a server-rendered status would be wrong for most of
 * the day. Returns undefined whenever the record cannot support the claim (no
 * timezone, non-weekly recurrence, a season that is not year-round, a market
 * between seasons), because a wrong "open now" is worse than none.
 */

import type { MarketFirstPartyFacts, MarketWeekday } from './enrichment.ts';

export interface OpenStatusInput {
  timezone: string;
  windows: { weekdays: MarketWeekday[]; opens: string; closes: string; label?: string }[];
  exceptions: { start_date: string; end_date?: string; status: 'closed' | 'modified_hours' | 'special_opening'; opens?: string; closes?: string }[];
}

export interface OpenStatus {
  open: boolean;
  text: string;
}

const WEEKDAYS: MarketWeekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The serializable input for a record, or undefined when it cannot support a status. */
export function openStatusInput(firstParty?: MarketFirstPartyFacts): OpenStatusInput | undefined {
  const operations = firstParty?.operations;
  const timezone = operations?.timezone?.value;
  const schedules = operations?.schedules ?? [];
  if (!timezone || !schedules.length) return undefined;
  const status = operations?.status?.value.value;
  if (status && status !== 'active') return undefined;
  const season = operations?.season?.value;
  if (season && season.kind !== 'year_round') return undefined;
  if (schedules.some((item) => item.value.recurrence.kind !== 'weekly' || item.value.recurrence.interval_weeks === 2 || item.value.start_date || item.value.end_date)) {
    return undefined;
  }
  return {
    timezone,
    windows: schedules.map((item) => ({
      weekdays: item.value.recurrence.kind === 'weekly' ? item.value.recurrence.weekdays : [],
      opens: item.value.opens,
      closes: item.value.closes,
      ...(item.value.label ? { label: item.value.label } : {}),
    })),
    exceptions: (operations?.exceptions ?? []).map((item) => ({
      start_date: item.value.start_date,
      ...(item.value.end_date ? { end_date: item.value.end_date } : {}),
      status: item.value.status,
      ...('opens' in item.value ? { opens: item.value.opens, closes: item.value.closes } : {}),
    })),
  };
}

function clock(value: string): string {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''}${hour < 12 ? 'am' : 'pm'}`;
}

/** Local date (YYYY-MM-DD), weekday index and HH:mm of `now` in `timezone`. */
function localParts(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now).map((part) => [part.type, part.value])
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, time: `${parts.hour}:${parts.minute}` };
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The opening windows on one local date, with exceptions applied. */
function windowsOn(input: OpenStatusInput, date: string, weekday: number) {
  const exception = input.exceptions.find((item) => item.start_date <= date && (item.end_date ?? item.start_date) >= date);
  if (exception?.status === 'closed') return [];
  if (exception && exception.opens && exception.closes) return [{ opens: exception.opens, closes: exception.closes }];
  return input.windows
    .filter((window) => window.weekdays.includes(WEEKDAYS[weekday]))
    .map(({ opens, closes }) => ({ opens, closes }));
}

export function computeOpenStatus(input: OpenStatusInput, now = new Date()): OpenStatus | undefined {
  let local: ReturnType<typeof localParts>;
  try {
    local = localParts(now, input.timezone);
  } catch {
    return undefined;
  }
  if (local.weekday < 0) return undefined;

  const today = windowsOn(input, local.date, local.weekday);
  const current = today.filter((window) => window.opens <= local.time && local.time < window.closes);
  if (current.length) {
    const closes = current.map((window) => window.closes).sort().at(-1)!;
    return { open: true, text: `Open now until ${clock(closes)}` };
  }
  const later = today.filter((window) => window.opens > local.time).sort((a, b) => a.opens.localeCompare(b.opens));
  if (later.length) return { open: false, text: `Closed now, opens today at ${clock(later[0].opens)}` };

  for (let offset = 1; offset <= 14; offset += 1) {
    const date = addDays(local.date, offset);
    const weekday = (local.weekday + offset) % 7;
    const windows = windowsOn(input, date, weekday).sort((a, b) => a.opens.localeCompare(b.opens));
    if (!windows.length) continue;
    const day = offset === 1 ? 'tomorrow' : DAY_NAMES[weekday];
    return { open: false, text: `Closed now, opens ${day} at ${clock(windows[0].opens)}` };
  }
  return undefined;
}
