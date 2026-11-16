import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { isAdmin, requireOrganizer } from '@/lib/organizer';
import { SignOutButton } from '@/components/organizer/dashboard/SignOutButton';
import { SITE_FRAME } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizer dashboard',
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOrganizer('/dashboard');
  const admin = isAdmin(user);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className={`${SITE_FRAME} flex flex-wrap items-center gap-x-4 gap-y-1 py-2`}>
          <Link
            href="/dashboard"
            className="text-sm font-semibold text-green-800 hover:text-green-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:text-green-400 dark:hover:text-green-300"
          >
            Organizer dashboard
          </Link>
          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
            <span className="hidden min-w-0 truncate text-sm text-zinc-500 sm:inline dark:text-zinc-400" title={user.email}>
              {user.email}
            </span>
            {admin ? (
              <Link
                href="/admin"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ShieldCheck aria-hidden="true" className="size-4" />
                Admin
              </Link>
            ) : null}
            <SignOutButton />
          </div>
          <span className="w-full truncate pb-1 text-xs text-zinc-500 sm:hidden dark:text-zinc-400">Signed in as {user.email}</span>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
