'use client';

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * Field errors, keyed by schema path ("schedules.0.closes")
 * ------------------------------------------------------------------ */

export const FieldErrorsContext = createContext<Record<string, string>>({});

export function useFieldError(path: string | undefined): string | undefined {
  const errors = useContext(FieldErrorsContext);
  return path ? errors[path] : undefined;
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function SectionCard({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{description}</p> : null}
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}

export interface ControlProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/**
 * Label above, control, then a short hint and any error. The control is a
 * render prop so it gets the id and aria wiring for free.
 */
export function Field({
  label,
  hint,
  optional,
  path,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  path?: string;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = useId();
  const error = useFieldError(path);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="gap-1 leading-5 text-zinc-900 dark:text-zinc-100">
        {label}
        {optional ? <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span> : null}
      </Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint ? (
        <p id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** A group of controls under one legend (chips, radios). */
export function FieldGroup({
  legend,
  hint,
  path,
  children,
}: {
  legend: ReactNode;
  hint?: ReactNode;
  path?: string;
  children: ReactNode;
}) {
  const error = useFieldError(path);
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{legend}</legend>
      {children}
      {hint ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
      <FieldError message={error} />
    </fieldset>
  );
}

/* ------------------------------------------------------------------ *
 * Controls sized for thumbs
 * ------------------------------------------------------------------ */

export function TextInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn('h-11 bg-white dark:bg-zinc-950', className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return <Textarea className={cn('min-h-28 bg-white dark:bg-zinc-950', className)} {...props} />;
}

/** Brand green for a checked shadcn Checkbox. */
export const GREEN_CHECK =
  'bg-white data-[state=checked]:border-green-700 data-[state=checked]:bg-green-700 data-[state=checked]:text-white dark:bg-zinc-950 dark:data-[state=checked]:bg-green-700';

/** Dropdown options sized for thumbs on a phone, compact with a mouse. */
export const TOUCH_ITEM = 'min-h-11 text-base sm:min-h-0 sm:text-sm';

/** Radix Select cannot hold an empty value, so "no choice" travels as this. */
const NO_CHOICE = '__none__';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

/**
 * A dropdown (shadcn Select). `placeholder` shows while nothing is chosen;
 * `emptyLabel` adds a first option that clears the value, like "Not sure".
 */
export function SelectInput<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  className,
  ...control
}: {
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  'aria-label'?: string;
} & Partial<ControlProps>) {
  const selected = value === undefined ? (emptyLabel ? NO_CHOICE : '') : String(value);
  return (
    <Select
      value={selected}
      onValueChange={(next) => onChange(options.find((option) => String(option.value) === next)?.value)}
    >
      <SelectTrigger
        {...control}
        className={cn('w-full bg-white text-base data-[size=default]:h-11 md:text-sm dark:bg-zinc-950', className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {emptyLabel ? (
          <SelectItem value={NO_CHOICE} className={TOUCH_ITEM}>
            {emptyLabel}
          </SelectItem>
        ) : null}
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} className={TOUCH_ITEM}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Options for `SelectInput` from a list of codes and their labels. */
export function optionsFrom<T extends string>(codes: readonly T[], labels: Record<T, string>): SelectOption<T>[] {
  return codes.map((code) => ({ value: code, label: labels[code] }));
}

/** Multi-select as toggle chips. */
export function ChipGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
  short,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: readonly T[];
  onChange: (next: T[]) => void;
  /** Long labels for screen readers when the visible label is abbreviated. */
  short?: Record<T, string>;
}) {
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      spacing={2}
      value={[...value]}
      // Keep the schema's own order so the saved value is stable.
      onValueChange={(next) => onChange(options.filter((code) => next.includes(code)))}
      className="w-full flex-wrap"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option}
          value={option}
          aria-label={short ? labels[option] : undefined}
          className={cn(
            'h-11 rounded-full bg-white px-4 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-300',
            'focus-visible:border-green-700 focus-visible:ring-green-600/40',
            'data-[state=on]:border-green-700 data-[state=on]:bg-green-700 data-[state=on]:text-white data-[state=on]:hover:bg-green-800 dark:data-[state=on]:border-green-600',
          )}
        >
          {short ? short[option] : labels[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/* ------------------------------------------------------------------ *
 * Repeating rows
 * ------------------------------------------------------------------ */

export function RowCard({
  title,
  onRemove,
  removeLabel,
  children,
}: {
  title: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</p>
        <RemoveButton onClick={onRemove} label={removeLabel} />
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="size-11 shrink-0 text-zinc-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    >
      <Trash2 aria-hidden="true" />
    </Button>
  );
}

export function AddButton({
  onClick,
  children,
  count,
  max,
}: {
  onClick: () => void;
  children: ReactNode;
  count: number;
  max: number;
}) {
  const full = count >= max;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={full}
        className="h-11 border-dashed px-4 text-green-800 hover:bg-green-50 hover:text-green-900 dark:text-green-400 dark:hover:bg-green-950/30"
      >
        <Plus aria-hidden="true" />
        {children}
      </Button>
      {full ? <span className="text-xs text-zinc-500 dark:text-zinc-400">That is the most a listing can show.</span> : null}
    </div>
  );
}

/** One plain text value per row (websites, phone numbers, products). */
export function StringList({
  values,
  onChange,
  max,
  pathPrefix,
  addLabel,
  itemLabel,
  inputProps,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  max: number;
  pathPrefix: string;
  addLabel: string;
  itemLabel: (index: number) => string;
  inputProps?: ComponentProps<'input'>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {values.map((value, index) => (
        <StringRow
          key={index}
          value={value}
          label={itemLabel(index)}
          path={`${pathPrefix}.${index}`}
          inputProps={inputProps}
          onChange={(next) => onChange(values.map((item, i) => (i === index ? next : item)))}
          onRemove={() => onChange(values.filter((_, i) => i !== index))}
        />
      ))}
      <AddButton onClick={() => onChange([...values, ''])} count={values.length} max={max}>
        {addLabel}
      </AddButton>
    </div>
  );
}

function StringRow({
  value,
  label,
  path,
  inputProps,
  onChange,
  onRemove,
}: {
  value: string;
  label: string;
  path: string;
  inputProps?: ComponentProps<'input'>;
  onChange: (next: string) => void;
  onRemove: () => void;
}) {
  const error = useFieldError(path);
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <TextInput
          {...inputProps}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <RemoveButton onClick={onRemove} label={`Remove ${label.toLowerCase()}`} />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** '' for an empty number input, the number otherwise. */
export function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.round(value) : undefined;
}
