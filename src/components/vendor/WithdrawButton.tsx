'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { withdrawApplicationAction } from '@/app/(app)/vendor/actions';
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

/** Withdraw one application, after a confirm. */
export function WithdrawButton({ applicationId, marketName, listed }: { applicationId: string; marketName: string; listed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function withdraw() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await withdrawApplicationAction(applicationId);
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
        <Button type="button" variant="outline" className="h-11 w-full sm:h-9 sm:w-auto" aria-label={`Withdraw from ${marketName}`}>
          <LogOut aria-hidden="true" />
          Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="break-words">Withdraw from {marketName}?</DialogTitle>
          <DialogDescription>
            {listed
              ? 'You will no longer be listed on this market’s page. You can apply again later.'
              : 'The market will stop seeing your application. You can apply again later.'}
          </DialogDescription>
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
          <Button type="button" variant="destructive" disabled={pending} onClick={withdraw} className="h-12 w-full sm:h-10 sm:w-auto">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {pending ? 'Withdrawing' : 'Withdraw'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
