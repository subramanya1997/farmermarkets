import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Sign in, sign up and the password pages: a quiet, centered column with the
 * wordmark back to the site and nothing else. No public header, footer or
 * visitor prompts, the same as the dashboards these pages lead into.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
      <header className="flex h-16 shrink-0 items-center px-4 sm:px-6">
        <Link
          href="/"
          className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
        >
          Farmer Markets
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center px-4 pt-4 pb-16 sm:justify-center sm:pt-8">{children}</main>
      <footer className="flex shrink-0 justify-center gap-4 px-4 py-6 text-xs text-zinc-500 dark:text-zinc-400">
        <Link href="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100">
          Terms
        </Link>
      </footer>
    </div>
  );
}
