import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/organizer';
import { announcementAudienceCounts, sentAnnouncements } from '@/lib/vendors';
import { AnnouncementForm } from '@/components/admin/AnnouncementForm';
import { Panel, TimeAgo } from '@/components/admin/bits';
import { PageHeader } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Announcements',
  robots: { index: false, follow: false },
};

export default async function AdminAnnouncePage() {
  await requireAdmin();
  const [counts, sent] = await Promise.all([announcementAudienceCounts(), sentAnnouncements()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Announcements">Email every vendor at once. You see a preview and confirm before anything is sent.</PageHeader>
      <AnnouncementForm counts={counts} />
      <Panel title={`Sent (${sent.length})`}>
        {sent.length === 0 ? (
          <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y">
            {sent.map((item) => (
              <li key={item.id} className="grid gap-x-4 gap-y-0.5 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                <p className="min-w-0 font-medium break-words">{item.subject}</p>
                <TimeAgo date={item.sentAt} className="text-xs text-zinc-500 sm:text-right dark:text-zinc-400" />
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.audience === 'all' ? 'All vendor accounts' : 'Vendors with a live profile'}, {item.recipientCount}{' '}
                  {item.recipientCount === 1 ? 'recipient' : 'recipients'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
