'use client';

import { useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ListingEdits } from '@/lib/listingEdits';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, SectionCard, TextArea, TextInput, useFieldError } from '../fields';

/**
 * The market's name, street address and map pin. Admins publish these
 * directly; organizers suggest changes that always wait for review.
 * City and state stay read-only because they decide the city page URL.
 */

type Identity = NonNullable<ListingEdits['identity']>;
type Location = NonNullable<ListingEdits['location']>;
type Coordinates = NonNullable<Location['coordinates']>;

export function IdentitySection({
  value,
  onChange,
}: {
  value: Identity | undefined;
  onChange: (next: Identity) => void;
}) {
  return (
    <SectionCard id="section-identity" title="Market name" description="Shown as the page title, in search results and on maps.">
      <Field label="Name" path="identity.name">
        {(control) => (
          <TextInput
            {...control}
            maxLength={150}
            autoComplete="off"
            value={value?.name ?? ''}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        )}
      </Field>
    </SectionCard>
  );
}

/** "40.7128" for a number, "" for nothing. */
function coordText(value: number | undefined): string {
  return value === undefined || Number.isNaN(value) ? '' : String(value);
}

/** Empty input is undefined; anything that is not a number becomes NaN so the schema flags it. */
function parseCoord(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.NaN;
}

function sameNumber(a: number | undefined, b: number | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && Number.isNaN(a) && Number.isNaN(b));
}

function coordsFromText(lat: string, lon: string): Coordinates | undefined {
  const a = parseCoord(lat);
  const b = parseCoord(lon);
  if (a === undefined && b === undefined) return undefined;
  // One half missing still counts as a pin, so the empty half shows an error.
  return { lat: a ?? Number.NaN, lon: b ?? Number.NaN };
}

export function LocationSection({
  value,
  onChange,
  city,
  state,
  cityNote = 'City and state decide which city page lists this market, so they cannot be changed here.',
}: {
  value: Location | undefined;
  onChange: (next: Location) => void;
  city?: string;
  state?: string;
  /** The line under city and state explaining why they are read-only. */
  cityNote?: string;
}) {
  const location: Location = value ?? {};
  const set = (patch: Partial<Location>) => onChange({ ...location, ...patch });

  // The pin inputs keep their own text so "40." or "-" can be typed on the way to a number.
  const coords = location.coordinates;
  const [text, setText] = useState({ lat: coordText(coords?.lat), lon: coordText(coords?.lon) });
  const [seen, setSeen] = useState(coords);
  if (coords !== seen) {
    setSeen(coords);
    const typed = coordsFromText(text.lat, text.lon);
    const matches = sameNumber(typed?.lat, coords?.lat) && sameNumber(typed?.lon, coords?.lon);
    if (!matches) setText({ lat: coordText(coords?.lat), lon: coordText(coords?.lon) });
  }

  function setCoord(key: 'lat' | 'lon', raw: string) {
    const next = { ...text, [key]: raw };
    setText(next);
    set({ coordinates: coordsFromText(next.lat, next.lon) });
  }

  const pinValid = coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon);
  const mapsUrl = pinValid ? `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}` : null;
  const pinError = useFieldError('location.coordinates');
  const mapId = useId();

  return (
    <SectionCard id="section-location" title="Address and map pin" description="Where the market happens and where its pin sits on the map.">
      <Field label="Street address" optional path="location.address">
        {(control) => (
          <TextInput
            {...control}
            maxLength={200}
            autoComplete="off"
            value={location.address ?? ''}
            onChange={(event) => set({ address: event.target.value })}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
        <ReadOnly label="City" value={city} />
        <ReadOnly label="State" value={state} />
        <Field label="ZIP code" optional path="location.zip_code">
          {(control) => (
            <TextInput
              {...control}
              inputMode="numeric"
              maxLength={20}
              autoComplete="off"
              value={location.zip_code ?? ''}
              onChange={(event) => set({ zip_code: event.target.value })}
            />
          )}
        </Field>
      </div>
      <p className="-mt-3 text-xs text-zinc-500 dark:text-zinc-400">{cityNote}</p>

      <Field
        label="Location note"
        optional
        path="location.location_description"
        hint="Where to find the stalls, for example: in the library parking lot off Main Street."
      >
        {(control) => (
          <TextArea
            {...control}
            rows={2}
            maxLength={400}
            className="min-h-16"
            value={location.location_description ?? ''}
            onChange={(event) => set({ location_description: event.target.value })}
          />
        )}
      </Field>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Map pin</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Latitude" path="location.coordinates.lat">
            {(control) => (
              <TextInput
                {...control}
                inputMode="decimal"
                autoComplete="off"
                placeholder="40.7128"
                value={text.lat}
                onChange={(event) => setCoord('lat', event.target.value)}
              />
            )}
          </Field>
          <Field label="Longitude" path="location.coordinates.lon">
            {(control) => (
              <TextInput
                {...control}
                inputMode="decimal"
                autoComplete="off"
                placeholder="-74.0060"
                value={text.lon}
                onChange={(event) => setCoord('lon', event.target.value)}
              />
            )}
          </Field>
        </div>
        <FieldError message={pinError} />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Decimal degrees. Latitude runs from -90 to 90, longitude from -180 to 180.{' '}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-green-800 underline-offset-4 hover:underline dark:text-green-400"
            >
              Open in Google Maps
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
        </p>
      </fieldset>

      <div className="flex items-start gap-3">
        <Checkbox
          id={mapId}
          className="mt-0.5"
          checked={Boolean(location.suppress_map)}
          onChange={(event) => set({ suppress_map: event.target.checked })}
        />
        <label htmlFor={mapId} className="text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">Hide the map on the public page</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            For markets without a fixed spot, or when the pin cannot be trusted.
          </span>
        </label>
      </div>
    </SectionCard>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
      <p className="flex h-11 items-center truncate rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-400">
        {value || 'Not set'}
      </p>
    </div>
  );
}
