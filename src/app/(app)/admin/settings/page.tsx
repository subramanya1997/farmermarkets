import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/organizer';
import { adminEmails } from '@/lib/organizerEmails';
import { Fact, Facts, Muted, Panel } from '@/components/admin/bits';
import { Code, DocList, DocPanel, PageHeader } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin settings',
  robots: { index: false, follow: false },
};

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
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings">Who can open the admin dashboard and where its emails go. Read only.</PageHeader>

      <Panel title="Admin access">
        <Facts>
          <Fact label="Admins">
            {admins.length ? (
              <ul className="space-y-0.5">
                {admins.map((email) => (
                  <li key={email} className="break-all">
                    {email}
                    {email === admin.email.toLowerCase() ? <Muted> (you)</Muted> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Muted>No one</Muted>
            )}
          </Fact>
          <Fact label="Read from">{listSource ? <Code>{listSource}</Code> : <Muted>Not set</Muted>}</Fact>
        </Facts>
        <p className="border-t px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
          Each one also needs an organizer account with a confirmed email. Anyone else who opens an admin page gets a 404.
        </p>
      </Panel>

      <Panel title="Email">
        <Facts>
          <Fact label="Review alerts go to">
            {admins.length ? 'Every admin above' : <Muted>No one, so alerts are skipped</Muted>}
          </Fact>
          <Fact label="Sender domain">{domain ?? <Muted>Not set</Muted>}</Fact>
          <Fact label="Delivery">{delivery}</Fact>
        </Facts>
        <p className="border-t px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
          Alerts go out when an organizer sends a claim or a listing update. Organizers get an email when you approve or
          reject either one.
        </p>
      </Panel>

      <DocPanel title="Changing these">
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
      </DocPanel>
    </div>
  );
}
