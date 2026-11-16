'use client';

import { useId, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Primary action styling shared by the organizer forms. */
export const PRIMARY_BUTTON = 'h-11 w-full bg-green-700 text-base text-white hover:bg-green-800 sm:h-10 sm:text-sm dark:bg-green-600 dark:hover:bg-green-700';

export const TEXT_LINK =
  'font-medium text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:text-green-400 dark:hover:text-green-300';

/** Props that tie an input to its hint and error text for screen readers. */
export function fieldA11y(id: string, error?: string, hint?: string) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  } as const;
}

interface FieldProps {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}

/** A label, the control, an optional hint and the field's own error message. */
export function Field({ id, label, optional, hint, error, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {label}
        {optional ? <span className="font-normal text-zinc-500 dark:text-zinc-400"> (optional)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-red-700 dark:text-red-400">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'>;

/** Password input with a show/hide toggle; typing a long password on a phone is error-prone. */
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('h-11 pr-11 sm:h-10', className)} />
      <button
        type="button"
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-zinc-500 hover:text-zinc-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </div>
  );
}

/** Form-level message: an error (announced right away) or a quiet success note. */
export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
    success: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200',
    info: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm', styles)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Submit button that shows a spinner and a pending label while the request runs. */
export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className={PRIMARY_BUTTON}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Stable id prefix for a form's fields, so two forms on a page never collide. */
export function useFieldIds<const T extends readonly string[]>(names: T): Record<T[number], string> {
  const base = useId();
  return Object.fromEntries(names.map((name) => [name, `${base}-${name}`])) as Record<T[number], string>;
}

/* ------------------------------------------------------------------ *
 * Better Auth client errors
 * ------------------------------------------------------------------ */

export interface AuthClientError {
  status?: number;
  code?: string;
  message?: string;
}

export const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a few minutes, then try again.';
export const NETWORK_MESSAGE = 'We could not reach the server. Check your connection and try again.';

export function isRateLimited(error: AuthClientError | null | undefined): boolean {
  return error?.status === 429;
}

/** Same rough shape as the server's email check; the server has the final say. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

export function passwordProblem(password: string): string | undefined {
  if (!password) return 'Choose a password.';
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use ${MAX_PASSWORD} characters or fewer.`;
  return undefined;
}
