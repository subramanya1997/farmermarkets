import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { NameForm } from '@/components/organizer/dashboard/AccountForms';
import { DocList, PageHeader, SettingsSection, SettingsSections } from '@/components/dashboard/DocBits';
import { AnnouncementsToggle } from '@/components/vendor/AnnouncementsToggle';
import { cachedVendorOverview } from '../_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function VendorSettingsPage() {
  const user = await requireOrganizer('/vendor/settings');
  const overview = await cachedVendorOverview(user);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Settings">Your account and the emails we send you.</PageHeader>

      <SettingsSections>
        <SettingsSection title="Account" description="Your name and the email you sign in with. Neither is shown on your public page.">
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Sign-in email</p>
              <p className="flex h-11 items-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
                <Mail aria-hidden="true" className="size-4 shrink-0 text-zinc-400" />
                <span className="min-w-0 truncate">{user.email}</span>
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Markets you apply to see it so they can reach you. To show an email to shoppers, add one to your profile.
              </p>
            </div>
            <NameForm initialName={user.name} />
          </div>
        </SettingsSection>

        <SettingsSection title="Announcement emails" description="Occasional news from Farmer Markets. Switch it off any time.">
          <div className="p-5 sm:p-6">
            <AnnouncementsToggle optedOut={overview.announcementsOptOut} />
          </div>
        </SettingsSection>

        <SettingsSection title="Emails you always get" description="These come with having an account.">
          <div className="space-y-3 p-5 text-sm leading-6 text-zinc-700 sm:p-6 dark:text-zinc-300">
            <DocList>
              <li>Whether your profile was approved, with a note from us when it was not.</li>
              <li>When a market decides on your application, or asks you for a new document.</li>
              <li>Sign-in codes, when you ask for one.</li>
            </DocList>
          </div>
        </SettingsSection>
      </SettingsSections>
    </div>
  );
}
