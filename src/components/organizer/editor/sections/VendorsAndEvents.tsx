'use client';

import { EVENT_KINDS, PROGRAM_KINDS, type ListingEdits } from '@/lib/listingEdits';
import {
  AddButton,
  Field,
  NativeSelect,
  RowCard,
  SectionCard,
  TextInput,
  numberOrUndefined,
} from '../fields';
import { EVENT_LABELS, PROGRAM_LABELS } from '../labels';

type Vendors = NonNullable<ListingEdits['vendors']>;
type Vendor = Vendors['roster'][number];
type MarketEvent = NonNullable<ListingEdits['events']>[number];
type Program = NonNullable<ListingEdits['programs']>[number];

const URL_INPUT = { type: 'url', inputMode: 'url', placeholder: 'https://', maxLength: 500 } as const;

function patchAt<T>(rows: T[], index: number, patch: Partial<T>): T[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

/* ------------------------------------------------------------------ *
 * Vendors
 * ------------------------------------------------------------------ */

const EMPTY_VENDORS: Vendors = { roster: [] };
const MAX_VENDORS = 100;

export function VendorsSection({
  value,
  onChange,
}: {
  value: Vendors | undefined;
  onChange: (next: Vendors) => void;
}) {
  const vendors = value ?? EMPTY_VENDORS;
  const set = (patch: Partial<Vendors>) => onChange({ ...vendors, ...patch });
  const roster = vendors.roster;

  return (
    <SectionCard id="section-vendors" title="Vendors" description="Who sells at your market.">
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="Number of vendors" optional path="vendors.count" hint="On a typical market day.">
          {(control) => (
            <TextInput
              {...control}
              type="number"
              inputMode="numeric"
              min={0}
              max={2000}
              value={vendors.count ?? ''}
              onChange={(event) => set({ count: numberOrUndefined(event.target.value) })}
            />
          )}
        </Field>
        <Field label="Vendor list on your site" optional path="vendors.directory_url" hint="If you keep one, we link to it.">
          {(control) => (
            <TextInput
              {...control}
              {...URL_INPUT}
              value={vendors.directory_url ?? ''}
              onChange={(event) => set({ directory_url: event.target.value })}
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Featured vendors <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
        </p>
        {roster.map((row, index) => (
          <RowCard
            key={index}
            title={row.name || `Vendor ${index + 1}`}
            onRemove={() => set({ roster: roster.filter((_, i) => i !== index) })}
            removeLabel={`Remove ${row.name || `vendor ${index + 1}`}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" path={`vendors.roster.${index}.name`}>
                {(control) => (
                  <TextInput
                    {...control}
                    maxLength={120}
                    value={row.name}
                    onChange={(event) => set({ roster: patchAt<Vendor>(roster, index, { name: event.target.value }) })}
                  />
                )}
              </Field>
              <Field label="What they sell" optional path={`vendors.roster.${index}.category`}>
                {(control) => (
                  <TextInput
                    {...control}
                    maxLength={60}
                    placeholder="Bakery"
                    value={row.category ?? ''}
                    onChange={(event) => set({ roster: patchAt<Vendor>(roster, index, { category: event.target.value }) })}
                  />
                )}
              </Field>
            </div>
            <Field label="Website" optional path={`vendors.roster.${index}.website`}>
              {(control) => (
                <TextInput
                  {...control}
                  {...URL_INPUT}
                  value={row.website ?? ''}
                  onChange={(event) => set({ roster: patchAt<Vendor>(roster, index, { website: event.target.value }) })}
                />
              )}
            </Field>
          </RowCard>
        ))}
        <AddButton count={roster.length} max={MAX_VENDORS} onClick={() => set({ roster: [...roster, { name: '' }] })}>
          Add a vendor
        </AddButton>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

export function EventsSection({
  value,
  onChange,
}: {
  value: MarketEvent[] | undefined;
  onChange: (next: MarketEvent[]) => void;
}) {
  const rows = value ?? [];
  const update = (index: number, patch: Partial<MarketEvent>) => onChange(patchAt(rows, index, patch));

  return (
    <SectionCard id="section-events" title="Events" description="Special days worth marking on the calendar. Past events drop off on their own.">
      {rows.length === 0 ? <p className="text-sm text-zinc-500 dark:text-zinc-400">No upcoming events.</p> : null}
      {rows.map((row, index) => (
        <RowCard
          key={index}
          title={row.name || `Event ${index + 1}`}
          onRemove={() => onChange(rows.filter((_, i) => i !== index))}
          removeLabel={`Remove ${row.name || `event ${index + 1}`}`}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field label="Name" path={`events.${index}.name`}>
              {(control) => (
                <TextInput
                  {...control}
                  maxLength={120}
                  placeholder="Strawberry festival"
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              )}
            </Field>
            <Field label="Type" path={`events.${index}.kind`}>
              {(control) => (
                <NativeSelect
                  {...control}
                  value={row.kind}
                  onChange={(event) => update(index, { kind: event.target.value as MarketEvent['kind'] })}
                >
                  {EVENT_KINDS.map((code) => (
                    <option key={code} value={code}>
                      {EVENT_LABELS[code]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" path={`events.${index}.start`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="date"
                  value={row.start}
                  onChange={(event) => update(index, { start: event.target.value })}
                />
              )}
            </Field>
            <Field label="Ends" optional path={`events.${index}.end`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="date"
                  min={row.start || undefined}
                  value={row.end ?? ''}
                  onChange={(event) => update(index, { end: event.target.value || undefined })}
                />
              )}
            </Field>
            <Field label="Starts at" optional path={`events.${index}.opens`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="time"
                  step={900}
                  value={row.opens ?? ''}
                  onChange={(event) => update(index, { opens: event.target.value || undefined })}
                />
              )}
            </Field>
            <Field label="Ends at" optional path={`events.${index}.closes`}>
              {(control) => (
                <TextInput
                  {...control}
                  type="time"
                  step={900}
                  value={row.closes ?? ''}
                  onChange={(event) => update(index, { closes: event.target.value || undefined })}
                />
              )}
            </Field>
          </div>
          <Field label="Description" optional path={`events.${index}.description`}>
            {(control) => (
              <TextInput
                {...control}
                maxLength={400}
                value={row.description ?? ''}
                onChange={(event) => update(index, { description: event.target.value })}
              />
            )}
          </Field>
          <Field label="Link" optional path={`events.${index}.url`}>
            {(control) => (
              <TextInput
                {...control}
                {...URL_INPUT}
                value={row.url ?? ''}
                onChange={(event) => update(index, { url: event.target.value })}
              />
            )}
          </Field>
        </RowCard>
      ))}
      <AddButton
        count={rows.length}
        max={30}
        onClick={() => onChange([...rows, { name: '', kind: 'special_market', start: '' }])}
      >
        Add an event
      </AddButton>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ *
 * Programs
 * ------------------------------------------------------------------ */

export function ProgramsSection({
  value,
  onChange,
}: {
  value: Program[] | undefined;
  onChange: (next: Program[]) => void;
}) {
  const rows = value ?? [];
  const update = (index: number, patch: Partial<Program>) => onChange(patchAt(rows, index, patch));

  return (
    <SectionCard id="section-programs" title="Programs" description="Ongoing things the market runs, like a kids club or cooking demos.">
      {rows.map((row, index) => (
        <RowCard
          key={index}
          title={row.name || `Program ${index + 1}`}
          onRemove={() => onChange(rows.filter((_, i) => i !== index))}
          removeLabel={`Remove ${row.name || `program ${index + 1}`}`}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <Field label="Name" path={`programs.${index}.name`}>
              {(control) => (
                <TextInput
                  {...control}
                  maxLength={120}
                  placeholder="Power of Produce kids club"
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              )}
            </Field>
            <Field label="Type" path={`programs.${index}.kind`}>
              {(control) => (
                <NativeSelect
                  {...control}
                  value={row.kind}
                  onChange={(event) => update(index, { kind: event.target.value as Program['kind'] })}
                >
                  {PROGRAM_KINDS.map((code) => (
                    <option key={code} value={code}>
                      {PROGRAM_LABELS[code]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label="Description" optional path={`programs.${index}.description`}>
            {(control) => (
              <TextInput
                {...control}
                maxLength={400}
                value={row.description ?? ''}
                onChange={(event) => update(index, { description: event.target.value })}
              />
            )}
          </Field>
          <Field label="Link" optional path={`programs.${index}.url`}>
            {(control) => (
              <TextInput
                {...control}
                {...URL_INPUT}
                value={row.url ?? ''}
                onChange={(event) => update(index, { url: event.target.value })}
              />
            )}
          </Field>
        </RowCard>
      ))}
      <AddButton
        count={rows.length}
        max={15}
        onClick={() => onChange([...rows, { name: '', kind: 'community' }])}
      >
        Add a program
      </AddButton>
    </SectionCard>
  );
}
