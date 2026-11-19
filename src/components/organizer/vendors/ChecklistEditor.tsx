'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AddButton,
  Field,
  FieldErrorsContext,
  FieldGroup,
  RowCard,
  SectionCard,
  TextArea,
  TextInput,
} from '@/components/vendor/fields';
import { FormAlert, PRIMARY_BUTTON } from '@/components/organizer/auth/FormBits';
import { CHECKLIST_PRESETS, MAX_CHECKLIST_ITEMS, checklistItemId, checklistSchema, type MarketChecklist } from '@/lib/vendorProfile';
import { saveChecklistAction } from '@/app/(app)/dashboard/markets/[slug]/vendors/actions';
import { cn } from '@/lib/utils';

interface Row {
  /** Stable React key. */
  key: string;
  /** The saved id; a custom row gets one from its name on its first save, and keeps it after that. */
  id: string | null;
  label: string;
  description: string;
  required: boolean;
}

interface State {
  accepting: boolean;
  intro: string;
  rows: Row[];
}

const MAX_LABEL = 80;
const MAX_DESCRIPTION = 300;
const MAX_INTRO = 600;

function initialState(checklist: MarketChecklist): State {
  return {
    accepting: checklist.settings.accepting,
    intro: checklist.settings.intro ?? '',
    rows: checklist.items
      .filter((item) => !item.archived)
      .map((item) => ({ key: item.id, id: item.id, label: item.label, description: item.description ?? '', required: item.required })),
  };
}

/** What counts as a change: everything the organizer can edit, in order. */
function fingerprint(state: State): string {
  return JSON.stringify([
    state.accepting,
    state.intro.trim(),
    state.rows.map((row) => [row.id ?? row.key, row.label.trim(), row.description.trim(), row.required]),
  ]);
}

let nextKey = 0;
const newKey = () => `new-${(nextKey += 1)}`;

const CHOICE =
  'h-11 flex-1 rounded-full bg-white px-4 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 sm:flex-none dark:bg-zinc-950 dark:text-zinc-300 ' +
  'focus-visible:border-green-700 focus-visible:ring-green-600/40 ' +
  'data-[state=on]:border-green-700 data-[state=on]:bg-green-700 data-[state=on]:text-white data-[state=on]:hover:bg-green-800 dark:data-[state=on]:border-green-600';

/**
 * The documents a market asks vendors for, and whether it takes applications.
 * Archived items (removed after vendors answered them) never show here and are
 * never sent: the server keeps them on record by itself.
 */
export function ChecklistEditor({ slug, checklist }: { slug: string; checklist: MarketChecklist }) {
  const router = useRouter();
  const switchId = useId();
  const [state, setState] = useState<State>(() => initialState(checklist));
  const [baseline, setBaseline] = useState(() => fingerprint(initialState(checklist)));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Ids the checklist already used, archived ones included, so a new item never reuses an old id.
  const archivedIds = useMemo(() => checklist.items.filter((item) => item.archived).map((item) => item.id), [checklist.items]);
  const archivedCount = archivedIds.length;

  const changed = fingerprint(state) !== baseline;
  const full = state.rows.length >= MAX_CHECKLIST_ITEMS;
  const presentIds = new Set(state.rows.map((row) => row.id).filter(Boolean));
  const presets = CHECKLIST_PRESETS.filter((preset) => !presentIds.has(preset.id));

  function update(next: (current: State) => State) {
    setState(next);
    setNotice(null);
  }

  function updateRow(key: string, patch: Partial<Row>) {
    update((current) => ({ ...current, rows: current.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)) }));
  }

  function addRow(row: Omit<Row, 'key'>) {
    const key = newKey();
    update((current) => ({ ...current, rows: [...current.rows, { ...row, key }] }));
    setFocusKey(key);
  }

  function removeRow(key: string) {
    update((current) => ({ ...current, rows: current.rows.filter((row) => row.key !== key) }));
    // Errors are keyed by position, so they no longer line up after a removal.
    setFieldErrors({});
  }

  function save() {
    setError(null);
    setNotice(null);
    setFieldErrors({});

    // Give each new custom row its id now, from its name, unique against every id in use.
    const taken = new Set<string>([...archivedIds, ...state.rows.flatMap((row) => (row.id ? [row.id] : []))]);
    const rows = state.rows.map((row) => {
      if (row.id) return row;
      const id = checklistItemId(row.label, taken);
      taken.add(id);
      return { ...row, id };
    });
    const payload = {
      items: rows.map((row) => ({ id: row.id as string, label: row.label, description: row.description, required: row.required })),
      settings: { accepting: state.accepting, intro: state.intro },
    };

    const checked = checklistSchema.safeParse(payload);
    if (!checked.success) {
      const errors: Record<string, string> = {};
      for (const issue of checked.error.issues) {
        const path = issue.path.join('.');
        errors[path] ??= issue.message;
      }
      setFieldErrors(errors);
      setError(errors.items ?? 'Some fields need a fix before you save.');
      return;
    }

    startTransition(async () => {
      const result = await saveChecklistAction(slug, payload);
      if (!result.ok) {
        const errors: Record<string, string> = {};
        for (const issue of result.fieldErrors ?? []) errors[issue.path] ??= issue.message;
        setFieldErrors(errors);
        setError(errors.items ?? result.error);
        return;
      }
      const saved: State = { ...state, rows };
      setState(saved);
      setBaseline(fingerprint(saved));
      setNotice(result.message ?? 'Checklist saved.');
      router.refresh();
    });
  }

  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        noValidate
      >
        <SectionCard title="Applications" description="Vendors see your note above the application form.">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <Label htmlFor={switchId} className="flex min-w-0 flex-col items-start gap-0.5 leading-5">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Taking applications</span>
              <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
                {state.accepting ? 'Vendors can apply from your link.' : 'Your link tells vendors you are not taking applications.'}
              </span>
            </Label>
            <Switch
              id={switchId}
              checked={state.accepting}
              onCheckedChange={(checked) => update((current) => ({ ...current, accepting: checked }))}
              className="origin-right scale-125 data-[state=checked]:bg-green-700 dark:data-[state=checked]:bg-green-600"
            />
          </div>

          <Field label="Note to vendors" optional path="settings.intro" hint={`What to know before applying: fees, season, stall sizes. Up to ${MAX_INTRO} characters.`}>
            {(control) => (
              <TextArea
                {...control}
                value={state.intro}
                maxLength={MAX_INTRO}
                onChange={(event) => update((current) => ({ ...current, intro: event.target.value }))}
              />
            )}
          </Field>
        </SectionCard>

        <SectionCard
          title="Documents you ask for"
          description="Vendors attach these when they apply. A document you add later never unlists an approved vendor; we ask them for it."
        >
          {state.rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              You do not ask for any documents yet. Add your own, or start from a common one below.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {state.rows.map((row, index) => (
                <li key={row.key}>
                  <RowCard
                    title={row.label.trim() || 'New document'}
                    removeLabel={`Remove ${row.label.trim() || 'this document'}`}
                    onRemove={() => removeRow(row.key)}
                  >
                    <Field label="Name" path={`items.${index}.label`}>
                      {(control) => (
                        <TextInput
                          {...control}
                          value={row.label}
                          maxLength={MAX_LABEL}
                          autoFocus={focusKey === row.key}
                          placeholder="Liability insurance"
                          onChange={(event) => updateRow(row.key, { label: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field label="Short description" optional path={`items.${index}.description`}>
                      {(control) => (
                        <TextArea
                          {...control}
                          value={row.description}
                          maxLength={MAX_DESCRIPTION}
                          rows={2}
                          className="min-h-20"
                          placeholder="What it is and what it must show."
                          onChange={(event) => updateRow(row.key, { description: event.target.value })}
                        />
                      )}
                    </Field>
                    <FieldGroup legend="Do vendors have to send it?" path={`items.${index}.required`}>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        spacing={2}
                        value={row.required ? 'required' : 'optional'}
                        onValueChange={(value) => {
                          // A single toggle group can be cleared by tapping the chosen one; keep a choice.
                          if (value) updateRow(row.key, { required: value === 'required' });
                        }}
                        className="w-full sm:w-auto"
                      >
                        <ToggleGroupItem value="required" className={CHOICE}>
                          Required
                        </ToggleGroupItem>
                        <ToggleGroupItem value="optional" className={CHOICE}>
                          Optional
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </FieldGroup>
                  </RowCard>
                </li>
              ))}
            </ol>
          )}

          <AddButton
            onClick={() => addRow({ id: null, label: '', description: '', required: true })}
            count={state.rows.length}
            max={MAX_CHECKLIST_ITEMS}
          >
            Add a document
          </AddButton>

          {presets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Common documents</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    disabled={full}
                    onClick={() => addRow({ id: preset.id, label: preset.label, description: preset.description, required: true })}
                    className="h-11 max-w-full rounded-full px-4 whitespace-normal text-zinc-700 dark:text-zinc-300"
                  >
                    <Plus aria-hidden="true" />
                    <span className="min-w-0 text-left break-words">{preset.label}</span>
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {archivedCount > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {archivedCount === 1 ? 'One document you removed is' : `${archivedCount} documents you removed are`} kept on record with the
              applications that sent them.
            </p>
          ) : null}
        </SectionCard>

        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {notice && !changed ? <FormAlert tone="success">{notice}</FormAlert> : null}
          <Button type="submit" disabled={!changed || isPending} className={cn(PRIMARY_BUTTON, 'sm:h-11')}>
            {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            {isPending ? 'Saving' : 'Save checklist'}
          </Button>
          {!changed && !notice ? (
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Make a change to save.</p>
          ) : null}
        </div>
      </form>
    </FieldErrorsContext.Provider>
  );
}
