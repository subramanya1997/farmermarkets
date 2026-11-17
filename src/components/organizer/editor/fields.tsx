'use client';

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
      <label htmlFor={id} className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {label}
        {optional ? <span className="font-normal text-zinc-500 dark:text-zinc-400"> (optional)</span> : null}
      </label>
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

/** Native select: the phone's own picker is the best one on a phone. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full min-w-0 appearance-none rounded-md border border-input bg-white bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3 text-base shadow-xs outline-none md:text-sm dark:bg-zinc-950',
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
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
  const selected = new Set(value);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = selected.has(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            aria-label={short ? labels[option] : undefined}
            onClick={() =>
              // Keep the schema's own order so the saved value is stable.
              onChange(options.filter((code) => (code === option ? !on : selected.has(code))))
            }
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors outline-none',
              'focus-visible:ring-[3px] focus-visible:ring-green-600/40',
              on
                ? 'border-green-700 bg-green-700 text-white hover:bg-green-800 dark:border-green-600 dark:bg-green-700'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-600',
            )}
          >
            {short ? short[option] : labels[option]}
          </button>
        );
      })}
    </div>
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
