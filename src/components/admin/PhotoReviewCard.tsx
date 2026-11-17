'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, LoaderCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { decidePhotoAction } from '@/app/(app)/admin/actions';

export interface ReviewPhoto {
  id: string;
  url: string;
  alt: string | null;
  caption: string | null;
  uploaded: string;
  uploadedTitle: string;
  uploader?: { name: string; email: string } | null;
}

/**
 * One pending photo with inline Approve and Reject. Rejecting deletes the file,
 * so it asks once more before it goes. The queue re-renders after a decision,
 * which removes the card; the local result covers the moment in between.
 */
export function PhotoReviewCard({
  photo,
  market,
}: {
  photo: ReviewPhoto;
  market?: { name: string; place: string; slug: string } | null;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  const [result, setResult] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'approve' | 'reject' | null>(null);
  const [isPending, startTransition] = useTransition();
  const label = market ? `Photo for ${market.name}` : 'Market photo';
  const subject = market ? `photo for ${market.name}` : 'this photo';

  function decide(approve: boolean) {
    setError(null);
    setChoice(approve ? 'approve' : 'reject');
    startTransition(async () => {
      const response = await decidePhotoAction(photo.id, approve);
      if (response.ok) setResult(approve ? 'approved' : 'rejected');
      else setError(response.error);
      setConfirmReject(false);
      setChoice(null);
    });
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border bg-white dark:bg-zinc-900">
      <a
        href={photo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-[4/3] bg-zinc-100 dark:bg-zinc-800"
        title="Open full size"
      >
        <Image
          src={photo.url}
          alt={photo.alt || label}
          fill
          sizes="(min-width: 1536px) 18vw, (min-width: 1024px) 24vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
        />
      </a>
      <div className="flex flex-1 flex-col gap-2 p-3 text-sm">
        {market ? (
          <div className="min-w-0">
            <Link href={`/admin/markets/${market.slug}`} className="block truncate font-medium hover:underline">
              {market.name}
            </Link>
            {market.place ? <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{market.place}</div> : null}
          </div>
        ) : null}
        <div className="space-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          <div>
            Uploaded <span title={photo.uploadedTitle}>{photo.uploaded}</span>
            {photo.uploader ? <> by {photo.uploader.name || 'No name'}</> : null}
          </div>
          {photo.uploader ? <div className="truncate">{photo.uploader.email}</div> : null}
          {photo.alt ? <div className="line-clamp-2">Alt: {photo.alt}</div> : <div>No alt text</div>}
          {photo.caption ? <div className="line-clamp-2">Caption: {photo.caption}</div> : null}
        </div>

        <div className="mt-auto pt-1">
          {result ? (
            <p role="status" className={result === 'approved' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
              {result === 'approved' ? 'Published' : 'Rejected and deleted'}
            </p>
          ) : confirmReject ? (
            <div className="space-y-1.5">
              <p className="text-xs">Reject and delete this file?</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={() => decide(false)} disabled={isPending}>
                  {isPending && choice === 'reject' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                  Reject
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReject(false)} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => decide(true)} disabled={isPending} aria-label={`Approve ${subject}`}>
                {isPending && choice === 'approve' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmReject(true)}
                disabled={isPending}
                className="text-red-700 hover:text-red-800 dark:text-red-400"
                aria-label={`Reject ${subject}`}
              >
                <X aria-hidden="true" />
                Reject
              </Button>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-1.5 text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
