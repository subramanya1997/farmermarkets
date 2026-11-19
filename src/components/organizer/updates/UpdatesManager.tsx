'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Megaphone, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, TextArea, TextInput } from '@/components/vendor/fields';
import { FormAlert, PRIMARY_BUTTON } from '@/components/organizer/auth/FormBits';
import {
  editMarketUpdateAction,
  postMarketUpdateAction,
  withdrawMarketUpdateAction,
} from '@/app/(app)/dashboard/markets/[slug]/updates/actions';
import type { DashboardMarketUpdate } from '@/lib/marketUpdates';
import { cn } from '@/lib/utils';

type Result = { ok: true; message?: string } | { ok: false; error: string };

/* ------------------------------------------------------------------ *
 * Dates in the organizer's own time zone
 * ------------------------------------------------------------------ */

const noop = () => () => {};
/** False during the server render, true in the browser: dates wait for the reader's time zone. */
function useInBrowser() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Until Saturday" means through the end of Saturday. */
function dayEnd(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + 1);
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** The last day an update shows, from its exclusive end. */
function lastDay(endsAt: string): Date {
  return new Date(Date.parse(endsAt) - 1);
}

function when(update: DashboardMarketUpdate): string {
  const until = shortDate(lastDay(update.endsAt));
  const from = shortDate(new Date(update.startsAt));
  switch (update.state) {
    case 'live':
      return from === until ? `Showing today, ${until}` : `Showing through ${until}`;
    case 'scheduled':
      return from === until ? `Shows on ${from}` : `Shows ${from} to ${until}`;
    case 'ended':
      return `Ended ${until}`;
    case 'withdrawn':
      return 'Withdrawn';
  }
}

/* ------------------------------------------------------------------ *
 * The page body
 * ------------------------------------------------------------------ */

export function UpdatesManager({
  slug,
  updates,
  maxOpen,
  maxLength,
}: {
  slug: string;
  updates: DashboardMarketUpdate[];
  maxOpen: number;
  maxLength: number;
}) {
  const open = updates.filter((update) => update.state === 'live' || update.state === 'scheduled');
  const past = updates.filter((update) => update.state === 'ended' || update.state === 'withdrawn');
  const full = open.length >= maxOpen;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section
        aria-labelledby="new-update"
        className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 id="new-update" className="text-base font-semibold tracking-tight">
          New update
        </h2>
        <div className="mt-3">
          {full ? (
            <FormAlert tone="info">
              You have {maxOpen} updates up or scheduled, the most at once. Withdraw one to post another.
            </FormAlert>
          ) : (
            <UpdateForm
              maxLength={maxLength}
              submitLabel="Post update"
              busyLabel="Posting"
              resetOnSuccess
              onSubmit={(input) => postMarketUpdateAction(slug, input)}
            />
          )}
        </div>
      </section>

      <section aria-labelledby="open-updates" className="flex flex-col gap-3">
        <h2 id="open-updates" className="text-base font-semibold tracking-tight">
          On your page <span className="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">{open.length}</span>
        </h2>
        {open.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-5 py-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
            <span className="flex size-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              <Megaphone aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nothing up right now</p>
            <p className="mt-1 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
              Post one when shoppers need to know something this week: closed for weather, a special market day, a favorite vendor out.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((update) => (
              <li key={update.id}>
                <UpdateCard slug={slug} update={update} maxLength={maxLength} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past-updates" className="flex flex-col gap-2">
          <h2 id="past-updates" className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
            Past
          </h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {past.map((update) => (
              <li key={update.id} className="flex flex-col gap-1 px-3 py-2.5 sm:px-4">
                <p className="text-sm break-words whitespace-pre-line text-zinc-700 dark:text-zinc-300">{update.body}</p>
                <WhenLine update={update} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function WhenLine({ update }: { update: DashboardMarketUpdate }) {
  const inBrowser = useInBrowser();
  return <p className="min-h-4 text-xs text-zinc-500 dark:text-zinc-400">{inBrowser ? when(update) : null}</p>;
}

/* ------------------------------------------------------------------ *
 * One live or scheduled update: edit and withdraw
 * ------------------------------------------------------------------ */

function UpdateCard({ slug, update, maxLength }: { slug: string; update: DashboardMarketUpdate; maxLength: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const result = await withdrawMarketUpdateAction(slug, update.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-xs sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Badge
          variant="outline"
          className={cn(
            'w-fit',
            update.state === 'live'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
              : 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
          )}
        >
          {update.state === 'live' ? 'Live' : 'Scheduled'}
        </Badge>
        <p className="text-sm break-words whitespace-pre-line text-zinc-900 dark:text-zinc-100">{update.body}</p>
        <WhenLine update={update} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="h-11 w-full sm:h-10 sm:w-auto">
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit update</DialogTitle>
              <DialogDescription>Changes show on your market page right away.</DialogDescription>
            </DialogHeader>
            <UpdateForm
              maxLength={maxLength}
              submitLabel="Save"
              busyLabel="Saving"
              initial={{ body: update.body, from: localDay(new Date(update.startsAt)), until: localDay(lastDay(update.endsAt)) }}
              onSubmit={(input) => editMarketUpdateAction(slug, update.id, input)}
              onDone={() => setEditing(false)}
            />
          </DialogContent>
        </Dialog>

        <Dialog
          open={confirming}
          onOpenChange={(next) => {
            if (isPending) return;
            setConfirming(next);
            if (!next) setError(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full text-red-700 hover:bg-red-50 hover:text-red-800 sm:h-10 sm:w-auto dark:text-red-400 dark:hover:bg-red-950/40"
            >
              Withdraw
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Withdraw this update?</DialogTitle>
              <DialogDescription>It comes off your market page now. You can post a new one any time.</DialogDescription>
            </DialogHeader>
            {error ? <FormAlert>{error}</FormAlert> : null}
            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isPending} className="h-11 w-full sm:h-10 sm:w-auto">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                type="button"
                onClick={withdraw}
                disabled={isPending}
                className="h-11 w-full bg-red-700 text-white hover:bg-red-800 sm:h-10 sm:w-auto dark:bg-red-700 dark:hover:bg-red-600"
              >
                {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Withdraw
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * The form, for a new update and for editing one
 * ------------------------------------------------------------------ */

function UpdateForm({
  maxLength,
  submitLabel,
  busyLabel,
  initial,
  resetOnSuccess = false,
  onSubmit,
  onDone,
}: {
  maxLength: number;
  submitLabel: string;
  busyLabel: string;
  initial?: { body: string; from: string; until: string };
  resetOnSuccess?: boolean;
  onSubmit: (input: { body: string; startsAt: string; endsAt: string }) => Promise<Result>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const inBrowser = useInBrowser();
  const [body, setBody] = useState(initial?.body ?? '');
  // Null means "today", filled in once the browser knows what today is.
  const [from, setFrom] = useState<string | null>(initial?.from ?? null);
  const [until, setUntil] = useState<string | null>(initial?.until ?? null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const today = inBrowser ? localDay(new Date()) : '';
  const fromValue = from ?? today;
  const untilValue = until ?? today;
  const remaining = maxLength - body.trim().length;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!body.trim()) {
      setError('Write a short update for shoppers.');
      return;
    }
    if (!fromValue || !untilValue) {
      setError('Pick the dates it should show.');
      return;
    }
    if (untilValue < fromValue) {
      setError('The last day has to be on or after the first day.');
      return;
    }
    startTransition(async () => {
      const result = await onSubmit({
        body,
        startsAt: dayStart(fromValue).toISOString(),
        endsAt: dayEnd(untilValue).toISOString(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (resetOnSuccess) {
        setBody('');
        setFrom(null);
        setUntil(null);
      }
      setNotice(result.message ?? 'Saved.');
      onDone?.();
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
      <Field
        label="Update for shoppers"
        hint={
          <span className={cn(remaining < 0 && 'font-medium text-red-700 dark:text-red-400')}>
            Plain text. {remaining} {Math.abs(remaining) === 1 ? 'character' : 'characters'} left.
          </span>
        }
      >
        {(control) => (
          <TextArea
            {...control}
            value={body}
            rows={3}
            className="min-h-24"
            maxLength={maxLength + 20}
            disabled={isPending}
            placeholder="Closed Saturday for the parade. See you next week!"
            onChange={(event) => setBody(event.target.value)}
          />
        )}
      </Field>
      {/* Stacked on a phone: a 16px date field needs more than half the width. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First day">
          {(control) => (
            <TextInput
              {...control}
              type="date"
              value={fromValue}
              min={initial ? undefined : today || undefined}
              disabled={isPending}
              onChange={(event) => setFrom(event.target.value)}
            />
          )}
        </Field>
        <Field label="Last day">
          {(control) => (
            <TextInput
              {...control}
              type="date"
              value={untilValue}
              min={fromValue || undefined}
              disabled={isPending}
              onChange={(event) => setUntil(event.target.value)}
            />
          )}
        </Field>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {onDone ? (
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending} className="h-11 w-full sm:h-10 sm:w-auto">
              Cancel
            </Button>
          </DialogClose>
        ) : null}
        <Button type="submit" disabled={isPending || remaining < 0} className={cn(PRIMARY_BUTTON, 'sm:w-auto sm:px-5')}>
          {isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {isPending ? busyLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
