import type { ReactNode } from "react";
import { displaySerif } from "@/lib/fonts";
import { SITE_FRAME } from "@/lib/ui";

/** The centered card the newsletter confirm and unsubscribe pages share. */
export function NewsletterNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50 dark:bg-zinc-950">
      <div className={`${SITE_FRAME} py-16 sm:py-24`}>
        <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green-700 dark:text-green-400">
            Farmer Markets newsletter
          </p>
          <h1 className={`${displaySerif.className} mt-3 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50`}>
            {title}
          </h1>
          <div className="mt-4 space-y-4 text-zinc-600 dark:text-zinc-400">{children}</div>
        </div>
      </div>
    </div>
  );
}

export const NOTICE_BUTTON =
  "inline-flex items-center justify-center rounded-full bg-green-700 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800";
