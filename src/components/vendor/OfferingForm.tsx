'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { postOfferingAction } from '@/app/(app)/vendor/actions';
import { useLocalDay } from '@/hooks/useLocalDay';
import { addDays, formatMarketDay, upcomingMarketDays } from '@/lib/offeringDays';
import { MAX_ITEM_NAME, MAX_ITEM_NOTE, MAX_OFFERING_DAYS, MAX_OFFERING_ITEMS, MAX_OFFERING_NOTE, type OfferingItem } from '@/lib/offeringRules';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { AddButton, Field, FieldErrorsContext, FieldGroup, RemoveButton, SelectInput, TextArea, TextInput } from './fields';
import { focusFirstInvalid, toErrorMap, type Notice } from './StickyBar';

export interface OfferingFormProps {
  market: { slug: string; name: string; days: string[] };
  /** The earliest US date at render time; the browser's own date takes over after hydration. */
  serverToday: string;
  /** The post being edited. */
  existing?: { id: string; startsOn: string; endsOn: string; items: OfferingItem[]; note: string | null };
  /** Items to start a new post from (the last post here). */
  startItems?: OfferingItem[];
  onDone?: () => void;
  onCancel?: () => void;
}

interface Row {
  key: number;
  name: string;
  note: string;
}

let nextKey = 1;
const row = (item?: Partial<OfferingItem>): Row => ({ key: nextKey++, name: item?.name ?? '', note: item?.note ?? '' });

const CHIP =
  'h-11 rounded-full bg-white px-4 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 focus-visible:border-green-700 focus-visible:ring-green-600/40 data-[state=on]:border-green-700 data-[state=on]:bg-green-700 data-[state=on]:text-white data-[state=on]:hover:bg-green-800 dark:bg-zinc-950 dark:text-zinc-300 dark:data-[state=on]:border-green-600';

/** Post (or edit) what the vendor is bringing to one market. */
export function OfferingForm({ market, serverToday, existing, startItems, onDone, onCancel }: OfferingFormProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLFormElement>(null);
  const today = useLocalDay(serverToday);
  const choices = useMemo(() => {
    const days = upcomingMarketDays(today, market.days, 6);
    // An edited post keeps its own day even when it is not one of the next few.
    return existing && !days.includes(existing.startsOn) ? [existing.startsOn, ...days] : days;
  }, [today, market.days, existing]);

  const [day, setDay] = useState<string | undefined>(existing?.startsOn);
  const [through, setThrough] = useState<string | undefined>(existing && existing.endsOn !== existing.startsOn ? existing.endsOn : undefined);
  const [rows, setRows] = useState<Row[]>(() => {
    const start = existing?.items ?? startItems ?? [];
    return start.length ? start.map(row) : [row()];
  });
  const [note, setNote] = useState(existing?.note ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [sending, startSending] = useTransition();
  const startsOn = day ?? choices[0];

  const throughOptions = useMemo(
    () =>
      startsOn
        ? Array.from({ length: MAX_OFFERING_DAYS - 1 }, (_, index) => {
            const value = addDays(startsOn, index + 1);
            return { value, label: formatMarketDay(value) };
          })
        : [],
    [startsOn],
  );

  function update(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
    setNotice(null);
  }

  function addRow(focus = false) {
    if (rows.length >= MAX_OFFERING_ITEMS) return;
    const added = row();
    setRows((current) => [...current, added]);
    if (focus) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLInputElement>(`[data-item="${added.key}"]`)?.focus());
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (sending || !startsOn) return;
    setErrors({});
    setNotice(null);
    const payload = {
      market: market.slug,
      starts_on: startsOn,
      ends_on: through && through > startsOn ? through : undefined,
      items: rows.map((item) => ({ name: item.name, ...(item.note.trim() ? { note: item.note } : {}) })),
      note,
    };
    startSending(async () => {
      try {
        const result = await postOfferingAction(payload, existing?.id);
        if (result.ok) {
          setNotice({ tone: 'success', text: result.message ?? 'Posted.' });
          router.refresh();
          onDone?.();
        } else {
          if (result.fieldErrors?.length) {
            setErrors(toErrorMap(result.fieldErrors));
            focusFirstInvalid(rootRef.current);
          }
          setNotice({ tone: 'error', text: result.error });
        }
      } catch {
        setNotice({ tone: 'error', text: 'That did not go through. Check your connection and try again.' });
      }
    });
  }

  return (
    <FieldErrorsContext.Provider value={errors}>
      <form ref={rootRef} onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <FieldGroup legend="Day" path="starts_on">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={startsOn}
            onValueChange={(next) => {
              if (!next) return;
              setDay(next);
              if (through && through <= next) setThrough(undefined);
              setNotice(null);
            }}
            className="w-full flex-wrap"
            aria-label="Day"
          >
            {choices.map((choice) => (
              <ToggleGroupItem key={choice} value={choice} className={CHIP}>
                {choice === today ? 'Today' : formatMarketDay(choice)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldGroup>

        <Field label="Through" optional path="ends_on">
          {(control) => (
            <SelectInput
              {...control}
              value={through}
              onChange={(next) => {
                setThrough(next);
                setNotice(null);
              }}
              options={throughOptions}
              emptyLabel="Just this day"
              placeholder="Just this day"
            />
          )}
        </Field>

        <FieldGroup legend="What you are bringing" path="items">
          <ul className="flex flex-col gap-3">
            {rows.map((item, index) => (
              <li key={item.key} className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <TextInput
                    data-item={item.key}
                    aria-label={`Item ${index + 1}`}
                    aria-invalid={errors[`items.${index}.name`] ? true : undefined}
                    value={item.name}
                    maxLength={MAX_ITEM_NAME}
                    placeholder={index === 0 ? 'Heirloom tomatoes' : 'Another item'}
                    enterKeyHint="next"
                    onChange={(event) => update(item.key, { name: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (index === rows.length - 1 && item.name.trim()) addRow(true);
                        else rootRef.current?.querySelector<HTMLInputElement>(`[data-item="${rows[index + 1]?.key}"]`)?.focus();
                      }
                    }}
                  />
                  <TextInput
                    aria-label={`Note for item ${index + 1} (optional)`}
                    aria-invalid={errors[`items.${index}.note`] ? true : undefined}
                    value={item.note}
                    maxLength={MAX_ITEM_NOTE}
                    placeholder="Note (optional)"
                    className="text-sm"
                    onChange={(event) => update(item.key, { note: event.target.value })}
                  />
                  {errors[`items.${index}.name`] || errors[`items.${index}.note`] ? (
                    <p className="text-sm font-medium text-red-700 sm:col-span-2 dark:text-red-400">
                      {errors[`items.${index}.name`] ?? errors[`items.${index}.note`]}
                    </p>
                  ) : null}
                </div>
                {rows.length > 1 ? (
                  <RemoveButton label={`Remove item ${index + 1}`} onClick={() => setRows((current) => current.filter((other) => other.key !== item.key))} />
                ) : null}
              </li>
            ))}
          </ul>
          <AddButton onClick={() => addRow(true)} count={rows.length} max={MAX_OFFERING_ITEMS}>
            Add item
          </AddButton>
        </FieldGroup>

        <Field label="Note" optional path="note">
          {(control) => (
            <TextArea
              {...control}
              value={note}
              maxLength={MAX_OFFERING_NOTE}
              placeholder="First come, first served. Cards welcome."
              className="min-h-20"
              onChange={(event) => {
                setNote(event.target.value);
                setNotice(null);
              }}
            />
          )}
        </Field>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-h-5 min-w-0 text-sm">
            {notice ? (
              <p
                className={cn(
                  'flex items-start gap-2 font-medium',
                  notice.tone === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-400',
                )}
              >
                {notice.tone === 'success' ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                <span className="min-w-0 break-words">{notice.text}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {onCancel ? (
              <Button type="button" variant="outline" onClick={onCancel} className="h-12 w-full sm:h-10 sm:w-auto">
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={sending}
              className="h-12 w-full bg-green-700 px-6 text-base text-white hover:bg-green-800 sm:h-10 sm:w-auto sm:text-sm dark:bg-green-700 dark:hover:bg-green-600"
            >
              {sending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
              {sending ? 'Posting' : existing ? 'Save' : 'Post'}
            </Button>
          </div>
        </div>
      </form>
    </FieldErrorsContext.Provider>
  );
}
