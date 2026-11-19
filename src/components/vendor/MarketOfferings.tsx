'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EyeOff, Loader2, Pencil, Plus } from 'lucide-react';
import { withdrawOfferingAction } from '@/app/(app)/vendor/actions';
import { useLocalDay } from '@/hooks/useLocalDay';
import { offeringDates, offeringIsCurrent } from '@/lib/offeringDays';
import type { OfferingItem } from '@/lib/offeringRules';
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
import { OfferingForm } from './OfferingForm';

export interface DeskPost {
  id: string;
  startsOn: string;
  endsOn: string;
  items: OfferingItem[];
  note: string | null;
  updatedAt: string;
}

export interface MarketOfferingsProps {
  market: { slug: string; name: string; days: string[] };
  posts: DeskPost[];
  lastItems: OfferingItem[];
  serverToday: string;
}

/** One market on the vendor desk: its open posts, and a form for the next one. */
export function MarketOfferings({ market, posts, lastItems, serverToday }: MarketOfferingsProps) {
  const today = useLocalDay(serverToday);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(posts.length === 0);

  return (
    <div className="flex flex-col gap-4">
      {posts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {posts.map((post) => (
            <li key={post.id} className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
              {editing === post.id ? (
                <OfferingForm
                  market={market}
                  serverToday={serverToday}
                  existing={post}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <PostView
                  post={post}
                  live={offeringIsCurrent(post, { from: today, to: today })}
                  marketName={market.name}
                  onEdit={() => {
                    setEditing(post.id);
                    setAdding(false);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <OfferingForm
          key={posts.length}
          market={market}
          serverToday={serverToday}
          startItems={lastItems}
          onDone={() => setAdding(false)}
          onCancel={posts.length > 0 ? () => setAdding(false) : undefined}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setAdding(true);
            setEditing(null);
          }}
          className="h-11 self-start border-dashed px-4 text-green-800 hover:bg-green-50 hover:text-green-900 dark:text-green-400 dark:hover:bg-green-950/30"
        >
          <Plus aria-hidden="true" />
          Post for another day
        </Button>
      )}
    </div>
  );
}

function PostView({ post, live, marketName, onEdit }: { post: DeskPost; live: boolean; marketName: string; onEdit: () => void }) {
  const dates = offeringDates(post);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium text-zinc-900 dark:text-zinc-100">{dates}</p>
        <span
          className={
            live
              ? 'rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white dark:bg-green-600'
              : 'rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700'
          }
        >
          {live ? 'Showing now' : 'Scheduled'}
        </span>
      </div>
      <ul className="space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
        {post.items.map((item, index) => (
          <li key={index} className="break-words">
            <span className="font-medium">{item.name}</span>
            {item.note ? <span className="text-zinc-600 dark:text-zinc-400">, {item.note}</span> : null}
          </li>
        ))}
      </ul>
      {post.note ? <p className="text-sm break-words whitespace-pre-line text-zinc-600 dark:text-zinc-400">{post.note}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <TakeDownButton offeringId={post.id} label={`${marketName}, ${dates}`} />
        <Button type="button" variant="outline" onClick={onEdit} className="h-11 w-full sm:h-9 sm:w-auto" aria-label={`Edit the post for ${dates}`}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      </div>
    </div>
  );
}

function TakeDownButton({ offeringId, label }: { offeringId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function takeDown() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await withdrawOfferingAction(offeringId);
        if (result.ok) {
          setOpen(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError('That did not go through. Check your connection and try again.');
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-11 w-full sm:h-9 sm:w-auto" aria-label={`Take down the post for ${label}`}>
          <EyeOff aria-hidden="true" />
          Take down
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words">Take down this post?</DialogTitle>
          <DialogDescription>Shoppers will stop seeing it on your page and the market page.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-12 w-full sm:h-10 sm:w-auto">
              Keep it
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" disabled={pending} onClick={takeDown} className="h-12 w-full sm:h-10 sm:w-auto">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {pending ? 'Taking down' : 'Take down'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
