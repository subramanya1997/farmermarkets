'use server';

/**
 * Server actions for an organizer's vendor desk: the checklist, and the
 * decisions on applications and documents. Each one re-checks the session;
 * src/lib/vendors.ts checks that the account manages the market and that
 * the application or document really belongs to it.
 */
import { revalidatePath } from 'next/cache';
import { getPublishedMarket, getSessionUser } from '@/lib/organizer';
import { decideApplication, decideDocument, saveChecklist, type VendorActionResult } from '@/lib/vendors';

async function context(slug: string) {
  const user = await getSessionUser();
  if (!user?.emailVerified) return { error: { ok: false as const, error: 'Your session ended. Sign in again to continue.' } };
  const market = await getPublishedMarket(String(slug));
  if (!market) return { error: { ok: false as const, error: 'We could not find that market.' } };
  return { user, market };
}

function cleanNote(note?: string): string | undefined {
  return typeof note === 'string' ? note.trim().slice(0, 1000) || undefined : undefined;
}

export async function saveChecklistAction(slug: string, checklist: unknown): Promise<VendorActionResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await saveChecklist(found.user, found.market, checklist);
  if (result.ok) revalidatePath(`/dashboard/markets/${found.market.slug}/vendors`);
  return result;
}

export async function decideApplicationAction(slug: string, applicationId: string, approve: boolean, note?: string): Promise<VendorActionResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await decideApplication(found.user, String(applicationId), Boolean(approve), cleanNote(note), found.market.id);
  if (result.ok) revalidatePath('/dashboard', 'layout');
  return result;
}

export async function decideDocumentAction(slug: string, submissionId: string, approve: boolean, note?: string): Promise<VendorActionResult> {
  const found = await context(slug);
  if ('error' in found) return found.error!;
  const result = await decideDocument(found.user, String(submissionId), Boolean(approve), cleanNote(note), found.market.id);
  if (result.ok) revalidatePath(`/dashboard/markets/${found.market.slug}/vendors`, 'layout');
  return result;
}
