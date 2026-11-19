'use client';

import { useEffect, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type Notice = { tone: 'success' | 'error'; text: string; extra?: ReactNode } | null;

/**
 * The bar pinned to the bottom of a vendor form: one status line that screen
 * readers hear, and one full-width primary button. Clears the home bar on
 * phones with the safe-area inset.
 */
export function StickyBar({
  notice,
  idle,
  label,
  busyLabel,
  busy,
  disabled,
  onSubmit,
  icon,
}: {
  notice: Notice;
  /** What the status line says when there is no notice. */
  idle: ReactNode;
  label: string;
  busyLabel: string;
  busy: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  icon?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-zinc-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-white/80 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-5 min-w-0 text-sm">
          {notice ? (
            <div
              className={cn(
                'flex items-start gap-2 font-medium',
                notice.tone === 'success' ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-400',
              )}
            >
              {notice.tone === 'success' ? (
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              ) : (
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              )}
              <p className="min-w-0 break-words">
                {notice.text}
                {notice.extra ? <> {notice.extra}</> : null}
              </p>
            </div>
          ) : (
            <p className="text-zinc-600 dark:text-zinc-400">{idle}</p>
          )}
        </div>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={busy || disabled}
          className="h-12 w-full shrink-0 bg-green-700 px-6 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:text-sm dark:bg-green-700 dark:hover:bg-green-600"
        >
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : (icon ?? <Send aria-hidden="true" />)}
          {busy ? busyLabel : label}
        </Button>
      </div>
    </div>
  );
}

/** Warn before the tab closes or reloads while there is unsent work. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Safari only shows the prompt when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

/** After a failed submit: move focus to the first field marked invalid, once it has rendered. */
export function focusFirstInvalid(root?: HTMLElement | null) {
  requestAnimationFrame(() => {
    const target = (root ?? document).querySelector<HTMLElement>('[aria-invalid="true"], [data-field-error]');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  });
}

/** Zod messages in plain words. */
export function friendlyIssue(path: string, message: string): string {
  const field = path.split('.').pop() ?? '';
  if (/^Too small: expected string/.test(message)) return field === 'name' ? 'Enter your business name' : 'Fill this in';
  if (/^Too big: expected string/.test(message)) return 'That is too long';
  if (/^Too big: expected array/.test(message)) return 'That is more than a profile can show';
  if (/^Invalid email/.test(message)) return 'Enter an email like hello@yourfarm.com';
  if (/^Invalid url/i.test(message)) return 'Enter a full web address starting with https://';
  if (/date like/.test(message)) return 'Pick a date';
  if (/^Invalid (input|option)/.test(message)) return 'Pick one of the options';
  return message;
}

export function toErrorMap(errors: readonly { path: string; message: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { path, message } of errors) {
    if (!(path in map)) map[path] = friendlyIssue(path, message);
  }
  return map;
}
