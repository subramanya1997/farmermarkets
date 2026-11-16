import type { ReactNode } from 'react';

interface AuthShellProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Links under the card, like "New here? Create an account". */
  footer?: ReactNode;
}

/** The narrow, centered column every organizer auth page sits in. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-green-50 to-white px-4 py-10 sm:py-16 dark:from-green-900/20 dark:to-zinc-950">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p> : null}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {children}
        </div>
        {footer ? <div className="mt-6 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">{footer}</div> : null}
      </div>
    </div>
  );
}
