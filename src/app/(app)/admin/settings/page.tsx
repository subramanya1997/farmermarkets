import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/organizer';
import { adminEmails } from '@/lib/organizerEmails';
import { Fact, Facts, Muted } from '@/components/admin/bits';
import { Code, DocList, PageHeader, SettingsSection, SettingsSections } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin settings',
  robots: { index: false, follow: false },
};

/** Label column sized for the narrower settings card. */
const FACT = 'px-5 py-2.5 sm:grid-cols-[8.5rem_minmax(0,1fr)]';

/** Just the domain of a sender like `Farmer Markets <hello@example.org>`. */
function senderDomain(from: string | undefined): string | null {
  const match = from?.match(/@([^\s>]+)/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Read-only: everything here comes from environment variables, so it is
 * changed in Vercel, not on this page.
 */
export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const admins = adminEmails();
  const listSource = process.env.ADMIN_EMAILS ? 'ADMIN_EMAILS' : process.env.DISCOVERY_NOTIFICATION_EMAIL ? 'DISCOVERY_NOTIFICATION_EMAIL' : null;
  const domain = senderDomain(process.env.DISCOVERY_FROM_EMAIL);
  const resendReady = Boolean(process.env.RESEND_API_KEY && process.env.DISCOVERY_FROM_EMAIL);
  const logOnly = process.env.ORGANIZER_EMAIL_LOG_ONLY === '1';

  const delivery = logOnly
    ? 'Printed to the server log instead of sent (ORGANIZER_EMAIL_LOG_ONLY is on)'
    : resendReady
      ? 'Sent through Resend'
      : process.env.NODE_ENV === 'production'
        ? 'Not sent: RESEND_API_KEY or DISCOVERY_FROM_EMAIL is missing'
        : 'Printed to the server log (Resend is not set up here)';

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader title="Settings">Who can open the admin dashboard and where its emails go. Read only.</PageHeader>

      <SettingsSections>
        <SettingsSection title="Admin access" description="Who can open these pages, and where that list comes from.">
          {admins.length ? (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {admins.map((email) => (
                <li key={email} className="flex min-w-0 items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-semibold text-green-900 uppercase dark:bg-green-900/50 dark:text-green-100"
                  >
                    {email.charAt(0)}
                  </span>
                  <span className="min-w-0 truncate text-sm" title={email}>
                    {email}
                  </span>
                  {email === admin.email.toLowerCase() ? (
                    <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      You
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-3 text-sm text-zinc-500 dark:text-zinc-400">No one</p>
          )}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <Facts>
              <Fact className={FACT} label="Read from">{listSource ? <Code>{listSource}</Code> : <Muted>Not set</Muted>}</Fact>
            </Facts>
          </div>
          <p className="border-t px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            Each one also needs an organizer account with a confirmed email. Anyone else who opens an admin page gets a 404.
          </p>
        </SettingsSection>

        <SettingsSection title="Email" description="Where review alerts go and how site email is sent.">
          <Facts>
            <Fact className={FACT} label="Review alerts go to">
              {admins.length ? 'Every admin above' : <Muted>No one, so alerts are skipped</Muted>}
            </Fact>
            <Fact className={FACT} label="Sender domain">{domain ?? <Muted>Not set</Muted>}</Fact>
            <Fact className={FACT} label="Delivery">{delivery}</Fact>
          </Facts>
          <p className="border-t px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            Alerts go out when an organizer sends a claim or a listing update. Organizers get an email when you approve or
            reject either one.
          </p>
        </SettingsSection>

        <SettingsSection title="Changing these" description="Everything on this page comes from Vercel environment variables.">
          <div className="space-y-3 p-5 text-sm leading-6 text-zinc-700 sm:p-6 dark:text-zinc-300">
            <p>
              All of these are environment variables on the Vercel project (Settings, then Environment Variables). A change
              takes effect with the next deployment.
            </p>
            <DocList>
              <li>
                <Code>ADMIN_EMAILS</Code> lists the admins, comma separated. They get admin access and the review alerts.
                When it is empty, <Code>DISCOVERY_NOTIFICATION_EMAIL</Code> is used instead.
              </li>
              <li>
                <Code>DISCOVERY_FROM_EMAIL</Code> is the sender for every site email. Its domain must be verified in Resend.
              </li>
              <li>
                <Code>RESEND_API_KEY</Code> is the Resend key that sends them.
              </li>
            </DocList>
          </div>
        </SettingsSection>
      </SettingsSections>
    </div>
  );
}
