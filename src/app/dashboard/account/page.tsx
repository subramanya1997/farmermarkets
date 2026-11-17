import type { Metadata } from 'next';
import { Mail } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { Panel } from '@/components/admin/bits';
import { NameForm, PasswordForm } from '@/components/organizer/dashboard/AccountForms';
import { withNext } from '@/components/organizer/auth/nextPath';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await requireOrganizer('/dashboard/account');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your name, email and password.</p>
      </div>

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
          <PasswordForm forgotHref={withNext('/forgot-password', '/dashboard/account')} />
        </div>
      </Panel>
    </div>
  );
}
