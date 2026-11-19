'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { deleteVendorAction, setVendorSuspendedAction } from '@/app/(app)/admin/vendors/actions';

/** Take down or restore the public page, or delete the vendor for good. */
export function VendorDangerZone({ vendorId, name, suspended }: { vendorId: string; name: string; suspended: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'suspend' | 'delete' | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSuspended() {
    setNotice(null);
    setBusy('suspend');
    startTransition(async () => {
      const result = await setVendorSuspendedAction(vendorId, !suspended);
      setBusy(null);
      if (!result.ok) {
        setNotice({ ok: false, text: result.error });
        return;
      }
      setNotice({ ok: true, text: result.message ?? (suspended ? 'Restored.' : 'Taken down.') });
      router.refresh();
    });
  }

  function remove() {
    setNotice(null);
    setBusy('delete');
    startTransition(async () => {
      const result = await deleteVendorAction(vendorId);
      if (!result.ok) {
        setBusy(null);
        setConfirming(false);
        setNotice({ ok: false, text: result.error });
        return;
      }
      router.push('/admin/vendors');
    });
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {notice ? (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={
            notice.ok
              ? 'rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-100'
              : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200'
          }
        >
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {suspended
            ? 'This vendor is taken down. Their public page is hidden.'
            : 'Hide the public page without deleting anything.'}
        </p>
        <Button type="button" variant="outline" onClick={toggleSuspended} disabled={isPending} className="h-11 shrink-0 sm:h-9">
          {busy === 'suspend' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {suspended ? 'Restore' : 'Take down'}
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Remove the vendor and everything they uploaded. This cannot be undone.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(true)}
          disabled={isPending}
          className="h-11 shrink-0 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 sm:h-9 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Trash2 aria-hidden="true" />
          Delete vendor
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={(open) => (isPending ? undefined : setConfirming(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              This removes the profile, applications, documents and files. It cannot be undone. The sign-in account stays.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)} disabled={isPending} className="h-11 sm:h-9">
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={isPending} className="h-11 sm:h-9">
              {busy === 'delete' ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              Delete vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
