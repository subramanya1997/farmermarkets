import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/organizer';
import { AdminMobileBar, AdminSidebar } from '@/components/admin/AdminNav';
import { cachedReviewQueue, waitingCount } from './_lib/queue';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const pending = waitingCount(await cachedReviewQueue());

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-zinc-50 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] dark:bg-zinc-950">
      <AdminSidebar email={admin.email} pending={pending} />
      <div className="min-w-0">
        <AdminMobileBar email={admin.email} pending={pending} />
        <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </div>
    </div>
  );
}
