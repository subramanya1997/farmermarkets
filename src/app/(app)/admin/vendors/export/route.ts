/**
 * Every vendor account as a CSV download, for the admin's own mailings.
 * Layouts do not wrap route handlers, so this checks for an admin itself;
 * everyone else gets the same 404 as the rest of /admin.
 */
import { requireAdmin } from '@/lib/organizer';
import { vendorsCsv } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  await requireAdmin();
  const csv = await vendorsCsv();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="farmer-markets-vendors-${date}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
