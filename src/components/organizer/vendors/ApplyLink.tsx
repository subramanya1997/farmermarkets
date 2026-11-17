'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The market's application link with a Copy button. */
export function ApplyLink({ url, accepting }: { url: string; accepting: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be blocked; select the link so a long press copies it.
      const target = document.getElementById('vendor-apply-link');
      if (target) window.getSelection()?.selectAllChildren(target);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section
      aria-labelledby="vendor-apply-link-title"
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="vendor-apply-link-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Vendor application link
      </h2>
      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
        Share this link with your vendors. They sign in with an emailed code and land on your application.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span
          id="vendor-apply-link"
          className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-xs break-all text-zinc-800 select-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        >
          {url}
        </span>
        <Button
          type="button"
          variant="outline"
          onClick={() => void copy()}
          className="h-11 w-full shrink-0 px-4 sm:h-10 sm:w-auto"
          aria-label={copied ? 'Link copied' : 'Copy vendor application link'}
        >
          {copied ? <Check aria-hidden="true" className="text-green-700 dark:text-green-400" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </p>
      {accepting ? null : (
        <p className="mt-3 text-sm text-amber-900 dark:text-amber-200">
          You are not taking applications right now. Turn them back on under Checklist.
        </p>
      )}
    </section>
  );
}
