'use client';

import { useId, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { setAnnouncementsAction } from '@/app/(app)/vendor/actions';
import { Checkbox } from '@/components/ui/checkbox';
import { GREEN_CHECK } from '@/components/vendor/fields';
import { cn } from '@/lib/utils';

/** One checkbox that saves as soon as it changes. */
export function AnnouncementsToggle({ optedOut }: { optedOut: boolean }) {
  const id = useId();
  const [subscribed, setSubscribed] = useState(!optedOut);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  function change(next: boolean) {
    const previous = subscribed;
    setSubscribed(next);
    setMessage(null);
    startSaving(async () => {
      try {
        const result = await setAnnouncementsAction(!next);
        if (result.ok) {
          setMessage({ tone: 'ok', text: result.message ?? 'Saved.' });
        } else {
          setSubscribed(previous);
          setMessage({ tone: 'error', text: result.error });
        }
      } catch {
        setSubscribed(previous);
        setMessage({ tone: 'error', text: 'That did not save. Check your connection and try again.' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg py-1 text-sm text-zinc-900 has-[:disabled]:cursor-wait dark:text-zinc-100"
      >
        <Checkbox
          id={id}
          checked={subscribed}
          disabled={saving}
          onCheckedChange={(value) => change(value === true)}
          className={cn('mt-0.5 size-5', GREEN_CHECK)}
        />
        <span className="min-w-0">
          <span className="block font-medium">Send me announcements</span>
          <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">New features, and markets near you looking for vendors. A few times a year.</span>
        </span>
      </label>
      <p aria-live="polite" className="min-h-5 pl-8 text-sm">
        {saving ? (
          <span className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            Saving
          </span>
        ) : message ? (
          <span className={message.tone === 'ok' ? 'text-green-800 dark:text-green-300' : 'font-medium text-red-700 dark:text-red-400'}>{message.text}</span>
        ) : null}
      </p>
    </div>
  );
}
