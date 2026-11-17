import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { Panel } from '@/components/admin/bits';
import { NameForm, PasswordForm } from '@/components/organizer/dashboard/AccountForms';
import { withNext } from '@/components/organizer/auth/nextPath';
import { DocList, PageHeader, TEXT_LINK } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await requireOrganizer('/dashboard/settings');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings">Your name, email and password, and the emails we send you.</PageHeader>

      <Panel title="Profile">
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Email</p>
            <p className="flex h-11 items-center gap-2 rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-700 sm:h-10 dark:border-zinc-700 dark:bg-zinc-950/60 dark:text-zinc-300">
              <Mail aria-hidden="true" className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 truncate">{user.email}</span>
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">You sign in with this email, and it is where we send review updates.</p>
          </div>
          <NameForm initialName={user.name} />
        </div>
      </Panel>

      <Panel title="Password">
        <div className="p-4 sm:p-5">
          <PasswordForm forgotHref={withNext('/forgot-password', '/dashboard/settings')} />
        </div>
      </Panel>

      <Panel title="Email updates">
        <div className="space-y-3 p-4 text-sm leading-6 text-zinc-700 sm:p-5 dark:text-zinc-300">
          <p>We only email {user.email} about your account and your listings:</p>
          <DocList>
            <li>Whether your claim for a market was approved.</li>
            <li>Whether an update you sent was published, with a note from us when it was not.</li>
            <li>Confirming your email and resetting your password, when you ask for them.</li>
          </DocList>
          <p>
            These come with having an account, so there is nothing to switch on or off. Photos are the exception: we do
            not email about them, and each one shows as waiting or live on your market&apos;s page here.{' '}
            <Link href="/dashboard/help#contact" className={TEXT_LINK}>
              Questions? Get in touch
            </Link>
            .
          </p>
        </div>
      </Panel>
    </div>
  );
}
