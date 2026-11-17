'use client';

import dynamic from 'next/dynamic';
import { useId, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { ListingEdits } from '@/lib/listingEdits';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Field, FieldError, GREEN_CHECK, SectionCard, TextArea, TextInput, useFieldError } from '../fields';

/**
 * The market's name, street address and map pin. Admins publish these
 * directly; organizers suggest changes that always wait for review.
 * City and state stay read-only because they decide the city page URL.
 */

type Identity = NonNullable<ListingEdits['identity']>;
/** MapLibre touches `window` on import, so the picker loads in the browser only. */
const PinPickerMap = dynamic(() => import('../PinPickerMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#f6f6f2] dark:bg-zinc-900" />,
});

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

  const pinValid =
    coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lon) && Math.abs(coords.lat) <= 90 && Math.abs(coords.lon) <= 180;
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem]">
        <ReadOnly label="City" value={city} />
        <ReadOnly label="State" value={state} />
        <Field label="ZIP code" optional path="location.zip_code" className="col-span-2 sm:col-span-1">
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
        <p className="-mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {pinValid ? 'Click the map or drag the pin to where the stalls are.' : 'Zoom in and click the map to drop the pin where the stalls are.'}
        </p>
        <div className="h-72 overflow-hidden rounded-lg border border-zinc-200 sm:h-80 dark:border-zinc-800">
          <PinPickerMap
            pin={pinValid ? { lat: coords.lat, lon: coords.lon } : undefined}
            onChange={(next) => {
              setText({ lat: coordText(next.lat), lon: coordText(next.lon) });
              set({ coordinates: next });
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
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
          You can also type the exact numbers, in decimal degrees.{' '}
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
          className={cn('mt-0.5', GREEN_CHECK)}
          checked={Boolean(location.suppress_map)}
          onCheckedChange={(checked) => set({ suppress_map: checked === true })}
        />
        <Label htmlFor={mapId} className="flex-col items-start gap-0.5 leading-5 font-normal">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">Hide the map on the public page</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            For markets without a fixed spot, or when the pin cannot be trusted.
          </span>
        </Label>
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
