'use client';

import { MARKET_STATUSES, WEEKDAYS, type ListingEdits } from '@/lib/listingEdits';
import { cn } from '@/lib/utils';
import {
  AddButton,
  ChipGroup,
  Field,
  FieldGroup,
  RowCard,
  SectionCard,
  SelectInput,
  TextInput,
  optionsFrom,
} from '../fields';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MONTHS, STATUS_LABELS, WEEKDAY_LONG, WEEKDAY_SHORT } from '../labels';

type Status = NonNullable<ListingEdits['status']>;
type Season = NonNullable<ListingEdits['season']>;
type Schedule = NonNullable<ListingEdits['schedules']>[number];

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

export function StatusSection({
  value,
  onChange,
}: {
  value: Status | undefined;
  onChange: (next: Status) => void;
}) {
  const status = value?.value;
  const dateLabel =
    status === 'seasonal_break' || status === 'temporarily_closed'
      ? 'Reopens on'
      : status === 'permanently_closed'
        ? 'Closed since'
        : null;

  return (
    <SectionCard id="section-status" title="Market status" description="Let visitors know if the market is open right now.">
      <Field label="Status" path="status.value">
        {(control) => (
          <SelectInput
            {...control}
            value={status}
            placeholder="Choose a status"
            options={optionsFrom(MARKET_STATUSES, STATUS_LABELS)}
            onChange={(next) => {
              if (!next) return;
              onChange({
                value: next,
                // A reopening date only makes sense while closed.
                effective_date: next === 'active' ? undefined : value?.effective_date,
                note: value?.note,
              });
            }}
          />
        )}
      </Field>

      {status && dateLabel ? (
        <Field label={dateLabel} optional path="status.effective_date" className="sm:max-w-xs">
          {(control) => (
            <TextInput
              {...control}
              type="date"
              value={value?.effective_date ?? ''}
              onChange={(event) => onChange({ ...value!, effective_date: event.target.value || undefined })}
            />
          )}
        </Field>
      ) : null}

      {status ? (
        <Field
          label="Note for visitors"
          optional
          path="status.note"
          hint="For example: Back on May 3 in the church parking lot."
        >
          {(control) => (
            <TextInput
              {...control}
              maxLength={200}
              value={value?.note ?? ''}
              onChange={(event) => onChange({ ...value!, note: event.target.value })}
            />
          )}
        </Field>
      ) : null}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ *
 * Season
 * ------------------------------------------------------------------ */

const DEFAULT_RANGE: Season = { kind: 'annual_range', start: { month: 5 }, end: { month: 10 } };

export function SeasonSection({
  value,
  onChange,
}: {
  value: Season | undefined;
  onChange: (next: Season) => void;
}) {
  const kind = value?.kind;
  return (
    <SectionCard id="section-season" title="Season" description="When in the year the market runs.">
      <FieldGroup legend="When are you open?" path="season.kind">
        <RadioGroup
          aria-label="When are you open?"
          value={kind ?? ''}
          onValueChange={(next) =>
            onChange(next === 'year_round' ? { kind: 'year_round' } : value?.kind === 'annual_range' ? value : DEFAULT_RANGE)
          }
          className="grid gap-2 sm:grid-cols-2"
        >
          <ChoiceCard value="year_round" checked={kind === 'year_round'} label="All year" detail="Open every month." />
          <ChoiceCard
            value="annual_range"
            checked={kind === 'annual_range'}
            label="Part of the year"
            detail="Pick the months you open and close."
          />
        </RadioGroup>
      </FieldGroup>

      {value?.kind === 'annual_range' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <MonthDayPicker
            legend="First market day"
            pathPrefix="season.start"
            value={value.start}
            onChange={(start) => onChange({ ...value, start })}
          />
          <MonthDayPicker
            legend="Last market day"
            pathPrefix="season.end"
            value={value.end}
            onChange={(end) => onChange({ ...value, end })}
          />
        </div>
      ) : null}
    </SectionCard>
  );
}

function ChoiceCard({ value, checked, label, detail }: { value: string; checked: boolean; label: string; detail: string }) {
  const id = `season-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn(
        'min-h-11 cursor-pointer flex-col items-start gap-0.5 rounded-lg border p-3 leading-5 font-normal transition-colors',
        checked
          ? 'border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
          : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600',
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <RadioGroupItem
          id={id}
          value={value}
          className="bg-white text-green-700 data-[state=checked]:border-green-700 dark:bg-zinc-950 [&_svg]:fill-green-700"
        />
        {label}
      </span>
      <span className="pl-6 text-xs text-zinc-500 dark:text-zinc-400">{detail}</span>
    </Label>
  );
}

const MONTH_OPTIONS = MONTHS.map((name, index) => ({ value: index + 1, label: name }));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));

function MonthDayPicker({
  legend,
  pathPrefix,
  value,
  onChange,
}: {
  legend: string;
  pathPrefix: string;
  value: { month: number; day?: number };
  onChange: (next: { month: number; day?: number }) => void;
}) {
  return (
    <FieldGroup legend={legend} path={`${pathPrefix}.day`}>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <SelectInput
          aria-label={`${legend}: month`}
          value={value.month}
          options={MONTH_OPTIONS}
          onChange={(month) => (month ? onChange({ ...value, month }) : undefined)}
        />
        <SelectInput
          aria-label={`${legend}: day`}
          value={value.day}
          emptyLabel="Any day"
          options={DAY_OPTIONS}
          onChange={(day) => onChange({ ...value, day })}
        />
      </div>
    </FieldGroup>
  );
}

/* ------------------------------------------------------------------ *
 * Days and hours
 * ------------------------------------------------------------------ */

const MAX_SCHEDULES = 14;

function scheduleTitle(schedule: Schedule, index: number): string {
  if (schedule.label) return schedule.label;
  if (schedule.weekdays.length === 1) return WEEKDAY_LONG[schedule.weekdays[0]];
  if (schedule.weekdays.length > 1) return schedule.weekdays.map((day) => WEEKDAY_SHORT[day]).join(', ');
  return `Market day ${index + 1}`;
}

export function SchedulesSection({
  value,
  onChange,
}: {
  value: Schedule[] | undefined;
  onChange: (next: Schedule[]) => void;
}) {
  const rows = value ?? [];
  const update = (index: number, patch: Partial<Schedule>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <SectionCard
      id="section-schedules"
      title="Days and hours"
      description="Visitors see this at the top of your page. Add a row for each set of hours."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No hours yet.</p>
      ) : null}
      {rows.map((row, index) => (
        <RowCard
          key={index}
          title={scheduleTitle(row, index)}
          onRemove={() => onChange(rows.filter((_, i) => i !== index))}
          removeLabel={`Remove ${scheduleTitle(row, index)}`}
        >
          <FieldGroup legend="Days" path={`schedules.${index}.weekdays`}>
            <ChipGroup
              options={WEEKDAYS}
              labels={WEEKDAY_LONG}
              short={WEEKDAY_SHORT}
              value={row.weekdays}
              onChange={(weekdays) => update(index, { weekdays })}
            />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens" path={`schedules.${index}.opens`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="time"
                  step={900}
                  value={row.opens}
                  onChange={(event) => update(index, { opens: event.target.value })}
                />
              )}
            </Field>
            <Field label="Closes" path={`schedules.${index}.closes`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="time"
                  step={900}
                  value={row.closes}
                  onChange={(event) => update(index, { closes: event.target.value })}
                />
              )}
            </Field>
          </div>
          <Field
            label="Label"
            optional
            path={`schedules.${index}.label`}
            hint="Useful when hours change, like Summer hours or Winter market."
          >
            {(control) => (
              <TextInput
                {...control}
                maxLength={80}
                value={row.label ?? ''}
                onChange={(event) => update(index, { label: event.target.value })}
              />
            )}
          </Field>
        </RowCard>
      ))}
      <AddButton
        count={rows.length}
        max={MAX_SCHEDULES}
        onClick={() => onChange([...rows, { weekdays: [], opens: '08:00', closes: '13:00' }])}
      >
        Add market hours
      </AddButton>
    </SectionCard>
  );
}
