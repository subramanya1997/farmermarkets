'use client';

import { useContext, useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AMENITY_CODES,
  ASSISTANCE_CODES,
  AVAILABILITY,
  INCENTIVE_KINDS,
  PAYMENT_CODES,
  PET_RULES,
  PRODUCT_CODES,
  type ListingEdits,
} from '@/lib/listingEdits';
import { AMENITY_LABELS } from '@/lib/organizerOverlay';
import {
  AddButton,
  ChipGroup,
  Field,
  FieldError,
  FieldErrorsContext,
  FieldGroup,
  SelectInput,
  optionsFrom,
  RowCard,
  SectionCard,
  TextInput,
} from '../fields';
import {
  ASSISTANCE_LABELS,
  AVAILABILITY_LABELS,
  INCENTIVE_LABELS,
  PAYMENT_LABELS,
  PET_LABELS,
  PRODUCT_LABELS,
} from '../labels';

type Payments = NonNullable<ListingEdits['payments']>;
type Incentive = Payments['incentives'][number];
type Products = NonNullable<ListingEdits['products']>;
type Amenities = NonNullable<ListingEdits['amenities']>;

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */

const EMPTY_PAYMENTS: Payments = { methods: [], assistance: [], incentives: [] };

export function PaymentsSection({
  value,
  onChange,
}: {
  value: Payments | undefined;
  onChange: (next: Payments) => void;
}) {
  const payments = value ?? EMPTY_PAYMENTS;
  const set = (patch: Partial<Payments>) => onChange({ ...payments, ...patch });
  const incentives = payments.incentives;
  const updateIncentive = (index: number, patch: Partial<Incentive>) =>
    set({ incentives: incentives.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <SectionCard
      id="section-payments"
      title="Payments and food assistance"
      description="Shoppers check this before they leave home."
    >
      <FieldGroup legend="Ways to pay" hint="Tap everything most vendors accept.">
        <ChipGroup
          options={PAYMENT_CODES}
          labels={PAYMENT_LABELS}
          value={payments.methods}
          onChange={(methods) => set({ methods })}
        />
      </FieldGroup>

      <FieldGroup legend="Food assistance" hint="Benefits the market accepts, at an info booth or at stalls.">
        <ChipGroup
          options={ASSISTANCE_CODES}
          labels={ASSISTANCE_LABELS}
          value={payments.assistance}
          onChange={(assistance) => set({ assistance })}
        />
      </FieldGroup>

      <FieldGroup
        legend="Incentive programs"
        hint="Programs that stretch benefits, like Double Up Food Bucks."
      >
        <div className="flex flex-col gap-3">
          {incentives.map((row, index) => (
            <RowCard
              key={index}
              title={row.name || `Program ${index + 1}`}
              onRemove={() => set({ incentives: incentives.filter((_, i) => i !== index) })}
              removeLabel={`Remove ${row.name || `program ${index + 1}`}`}
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
                <Field label="Name" path={`payments.incentives.${index}.name`}>
                  {(control) => (
                    <TextInput
                      {...control}
                      maxLength={120}
                      placeholder="Double Up Food Bucks"
                      value={row.name}
                      onChange={(event) => updateIncentive(index, { name: event.target.value })}
                    />
                  )}
                </Field>
                <Field label="Type" path={`payments.incentives.${index}.kind`}>
                  {(control) => (
                    <SelectInput
                      {...control}
                      value={row.kind}
                      options={optionsFrom(INCENTIVE_KINDS, INCENTIVE_LABELS)}
                      onChange={(kind) => (kind ? updateIncentive(index, { kind }) : undefined)}
                    />
                  )}
                </Field>
              </div>
              <Field
                label="How it works"
                optional
                path={`payments.incentives.${index}.note`}
                hint="For example: SNAP matched up to $20 each market day."
              >
                {(control) => (
                  <TextInput
                    {...control}
                    maxLength={300}
                    value={row.note ?? ''}
                    onChange={(event) => updateIncentive(index, { note: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Link" optional path={`payments.incentives.${index}.url`}>
                {(control) => (
                  <TextInput
                    {...control}
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    maxLength={500}
                    value={row.url ?? ''}
                    onChange={(event) => updateIncentive(index, { url: event.target.value })}
                  />
                )}
              </Field>
            </RowCard>
          ))}
          <AddButton
            count={incentives.length}
            max={5}
            onClick={() => set({ incentives: [...incentives, { name: '', kind: 'match' }] })}
          >
            Add an incentive program
          </AddButton>
        </div>
      </FieldGroup>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

const EMPTY_PRODUCTS: Products = { categories: [], items: [] };
const MAX_ITEMS = 40;

export function ProductsSection({
  value,
  onChange,
}: {
  value: Products | undefined;
  onChange: (next: Products) => void;
}) {
  const products = value ?? EMPTY_PRODUCTS;
  const set = (patch: Partial<Products>) => onChange({ ...products, ...patch });
  return (
    <SectionCard id="section-products" title="What you can buy" description="Helps people searching for something specific find you.">
      <FieldGroup legend="Categories">
        <ChipGroup
          options={PRODUCT_CODES}
          labels={PRODUCT_LABELS}
          value={products.categories}
          onChange={(categories) => set({ categories })}
        />
      </FieldGroup>
      <TagInput items={products.items} onChange={(items) => set({ items })} />
    </SectionCard>
  );
}

/** Type a product, press Enter or Add; tap a tag's x to remove it. */
function TagInput({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const inputId = useId();
  const errors = useContext(FieldErrorsContext);
  const itemErrors = Object.entries(errors)
    .filter(([path]) => path.startsWith('products.items'))
    .map(([path, message]) => {
      const index = Number(path.split('.')[2]);
      return Number.isInteger(index) && items[index] ? `${items[index]}: ${message}` : message;
    });
  const full = items.length >= MAX_ITEMS;

  const add = () => {
    const parts = draft
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' ').slice(0, 60))
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(items.map((item) => item.toLowerCase()));
    const next = [...items];
    for (const part of parts) {
      if (next.length >= MAX_ITEMS) break;
      if (seen.has(part.toLowerCase())) continue;
      seen.add(part.toLowerCase());
      next.push(part);
    }
    onChange(next);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId} className="gap-1 leading-5 text-zinc-900 dark:text-zinc-100">
        Popular items <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
      </Label>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Items">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 py-1 pr-1 pl-3 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              {item}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                aria-label={`Remove ${item}`}
                className="size-8 rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <TextInput
          id={inputId}
          value={draft}
          disabled={full}
          maxLength={200}
          placeholder={full ? 'That is the most a listing can show.' : 'Sourdough, heirloom tomatoes'}
          enterKeyHint="done"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" className="h-11 px-4" onClick={add} disabled={full || !draft.trim()}>
          <Plus aria-hidden="true" />
          Add
        </Button>
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Separate several with commas. {items.length} of {MAX_ITEMS}.
      </p>
      {itemErrors.map((message) => (
        <FieldError key={message} message={message} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Amenities
 * ------------------------------------------------------------------ */

const EMPTY_AMENITIES: Amenities = { available: [] };

export function AmenitiesSection({
  value,
  onChange,
}: {
  value: Amenities | undefined;
  onChange: (next: Amenities) => void;
}) {
  const amenities = value ?? EMPTY_AMENITIES;
  const set = (patch: Partial<Amenities>) => onChange({ ...amenities, ...patch });

  return (
    <SectionCard id="section-amenities" title="Amenities and access" description="Small details that help families and older visitors plan.">
      <FieldGroup legend="On site">
        <ChipGroup
          options={AMENITY_CODES}
          labels={AMENITY_LABELS}
          value={amenities.available}
          onChange={(available) => set({ available })}
        />
      </FieldGroup>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parking" path="amenities.parking">
          {(control) => (
            <SelectInput
              {...control}
              value={amenities.parking}
              emptyLabel="Not sure"
              options={optionsFrom(AVAILABILITY, AVAILABILITY_LABELS)}
              onChange={(parking) => set({ parking })}
            />
          )}
        </Field>
        <Field label="Pets" path="amenities.pets">
          {(control) => (
            <SelectInput
              {...control}
              value={amenities.pets}
              emptyLabel="Not sure"
              options={optionsFrom(PET_RULES, PET_LABELS)}
              onChange={(pets) => set({ pets })}
            />
          )}
        </Field>
      </div>

      <Field
        label="Parking details"
        optional
        path="amenities.parking_note"
        hint="For example: Free lot behind the library."
      >
        {(control) => (
          <TextInput
            {...control}
            maxLength={200}
            value={amenities.parking_note ?? ''}
            onChange={(event) => set({ parking_note: event.target.value })}
          />
        )}
      </Field>
      <Field
        label="Accessibility"
        optional
        path="amenities.accessibility_note"
        hint="Paths, ramps, accessible restrooms, quiet hours."
      >
        {(control) => (
          <TextInput
            {...control}
            maxLength={300}
            value={amenities.accessibility_note ?? ''}
            onChange={(event) => set({ accessibility_note: event.target.value })}
          />
        )}
      </Field>
    </SectionCard>
  );
}
