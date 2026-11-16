import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/organizer';
import { SITE_FRAME } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Review',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50 dark:bg-zinc-950">
      <div className="border-b bg-white dark:bg-zinc-900">
        <div className={`${SITE_FRAME} flex h-11 items-center justify-between gap-4 text-sm`}>
          <nav aria-label="Admin" className="flex items-center gap-4">
            <Link href="/admin" className="font-semibold">
              Review desk
            </Link>
            <Link href="/admin" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Queue
            </Link>
            <Link href="/" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
              Back to site
            </Link>
          </nav>
          <span className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-400">{admin.email}</span>
        </div>
      </div>
      <div className={`${SITE_FRAME} py-6`}>{children}</div>
    </div>
  );
}
