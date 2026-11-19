'use client';

import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { SelectInput, type SelectOption } from './fields';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The last day of a month as YYYY-MM-DD: a document good "through May 2027" counts until May 31. */
function lastDay(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parse(value: string): { year?: number; month?: number } {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : {};
}

/**
 * An optional expiry as month and year (two shadcn Selects), not a native
 * date input. Permits and insurance are dated by month; the value is the
 * last day of that month, or '' for none.
 */
export function ExpiryPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const id = useId();
  const { year, month } = parse(value);
  const now = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, index) => now - 1 + index);
  if (year && !years.includes(year)) years.push(year);
  const yearOptions: SelectOption<number>[] = years.sort((a, b) => a - b).map((y) => ({ value: y, label: String(y) }));
  const monthOptions: SelectOption<number>[] = MONTHS.map((label, index) => ({ value: index + 1, label }));

  function set(nextMonth: number | undefined, nextYear: number | undefined) {
    if (!nextMonth && !nextYear) return onChange('');
    // Picking one half fills the other with the next time that month comes round.
    const thisMonth = new Date().getMonth() + 1;
    const fallbackYear = nextMonth && nextMonth < thisMonth ? now + 1 : now;
    onChange(lastDay(nextYear ?? fallbackYear, nextMonth ?? 12));
  }

  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex min-w-0 flex-col gap-1.5">
      <Label id={`${id}-label`} className="gap-1 leading-5 text-zinc-900 dark:text-zinc-100">
        Good through <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
      </Label>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <SelectInput<number>
          aria-label="Month"
          value={month}
          options={monthOptions}
          placeholder="Month"
          emptyLabel={value ? 'No expiry' : undefined}
          onChange={(next) => (next === undefined ? onChange('') : set(next, year))}
        />
        <SelectInput<number> aria-label="Year" value={year} options={yearOptions} placeholder="Year" onChange={(next) => set(month, next)} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">We show it as expired after that month.</p>
    </div>
  );
}
