"use client";

import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

/**
 * The "Show all" button and the full offers list in a native `<dialog>`.
 *
 * Native rather than the Radix dialog because the list must be in the server
 * HTML: Radix mounts its content only when opened, which would hide every
 * row past the first ten from crawlers. The browser handles focus, Escape
 * and the backdrop.
 */
export function OffersDialog({ count, children }: { count: number; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          trackEvent('market_offers_opened', { count });
        }}
        className="mt-4 rounded-lg border border-zinc-900 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-200 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        Show all {count} items
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="market-offers-dialog-heading"
        // A click on the backdrop lands on the dialog element itself.
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/50 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X aria-hidden className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </button>
            {/* Not a heading: the section's own h2 already names this list. */}
            <p id="market-offers-dialog-heading" className="text-lg font-semibold tracking-tight">
              What this market offers
            </p>
          </div>
          <div className="overflow-y-auto px-6">{children}</div>
        </div>
      </dialog>
    </>
  );
}
