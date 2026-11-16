'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revokeManagerAction } from '@/app/admin/actions';

/** Removes one organizer's access to a market, after an inline confirm. */
export function RevokeManagerButton({ marketId, userId, name }: { marketId: string; userId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function revoke() {
    setError(null);
    startTransition(async () => {
      const result = await revokeManagerAction(marketId, userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">Remove access?</span>
          <Button size="sm" variant="destructive" onClick={revoke} disabled={isPending}>
            {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Revoke
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(true)}
          className="text-red-700 hover:text-red-800 dark:text-red-400"
          aria-label={`Revoke access for ${name}`}
        >
          Revoke
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
