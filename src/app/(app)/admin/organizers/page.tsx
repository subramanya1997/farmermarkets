import type { Metadata } from 'next';
import { adminOrganizers, requireAdmin } from '@/lib/organizer';
import { OrganizersTable, type OrganizerRow } from '@/components/admin/OrganizersTable';
import { formatTimestamp, placeLabel, timeAgo } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Organizers',
  robots: { index: false, follow: false },
};

export default async function AdminOrganizersPage() {
  await requireAdmin();
  const accounts = await adminOrganizers();

  const rows: OrganizerRow[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    email: account.email,
    verified: account.emailVerified,
    admin: account.admin,
    joined: timeAgo(account.createdAt),
    joinedTitle: formatTimestamp(account.createdAt),
    manages: account.manages.map((market) => ({ slug: market.slug, name: market.name, place: placeLabel(market) })),
    claims: account.claims.map((claim) => ({
      id: claim.id,
      status: claim.status,
      market: claim.market ? { slug: claim.market.slug, name: claim.market.name } : null,
    })),
  }));
  const managing = accounts.filter((account) => account.manages.length > 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizers</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}, {managing} managing at least one market. Newest first.
        </p>
      </div>
      <OrganizersTable rows={rows} />
    </div>
  );
}
