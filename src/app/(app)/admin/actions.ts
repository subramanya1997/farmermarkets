'use server';

/** Admin review actions. Each re-checks that the caller is an admin. */
import { revalidatePath } from 'next/cache';
import { marketService } from '@/app/api/markets/data';
import { searchMarkets } from '@/lib/marketSearch';
import { decideBotAction } from '@/lib/botActions';
import type { ListingSection } from '@/lib/listingEdits';
import {
  addManagerByEmail,
  adminPublish,
  getPublishedMarket,
  resetSections,
  decideChange,
  decideClaim,
  decidePhoto,
  getSessionUser,
  isAdmin,
  markLegacySubmissionReviewed,
  revokeManager,
  type ActionResult,
} from '@/lib/organizer';

async function admin() {
  const user = await getSessionUser();
  return isAdmin(user) ? user! : null;
}

const NOT_ALLOWED: ActionResult = { ok: false, error: 'Not allowed.' };

function cleanNote(note: unknown): string | undefined {
  return typeof note === 'string' ? note.trim().slice(0, 1000) || undefined : undefined;
}

export async function decideClaimAction(id: string, approve: boolean, note?: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideClaim(user, id, approve, cleanNote(note));
  revalidatePath('/admin');
  return result;
}

export async function decideChangeAction(id: string, approve: boolean, note?: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideChange(user, id, approve, cleanNote(note));
  revalidatePath('/admin');
  return result;
}

export async function decidePhotoAction(photoId: string, approve: boolean): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decidePhoto(user, photoId, approve);
  revalidatePath('/admin');
  return result;
}

/** Approve or dismiss a removal or closure the outreach bot asked for. */
export async function decideBotActionAction(id: string, approve: boolean, note?: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideBotAction(user, id, approve, cleanNote(note));
  revalidatePath('/admin');
  return result;
}

export async function revokeManagerAction(marketId: string, userId: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await revokeManager(marketId, userId);
  revalidatePath('/admin');
  return result;
}

export async function markLegacyClaimHandledAction(id: string, note?: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await markLegacySubmissionReviewed(id, cleanNote(note));
  revalidatePath('/admin');
  return result;
}

export type AdminPublishResult = ActionResult | { ok: false; error: string; fieldErrors: { path: string; message: string }[] };

/** Admin edits publish immediately (no review). */
export async function adminPublishAction(slug: string, edits: unknown): Promise<AdminPublishResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const market = await getPublishedMarket(slug);
  if (!market) return { ok: false, error: 'We could not find that market.' };
  const result = await adminPublish(user, market, edits);
  revalidatePath(`/admin/markets/${slug}`);
  return result;
}

export async function resetSectionsAction(slug: string, sections: ListingSection[]): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const market = await getPublishedMarket(slug);
  if (!market || !Array.isArray(sections)) return { ok: false, error: 'We could not find that market.' };
  const result = await resetSections(user, market, sections.slice(0, 20));
  revalidatePath(`/admin/markets/${slug}`);
  return result;
}

export async function addManagerAction(slug: string, email: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const market = await getPublishedMarket(slug);
  if (!market || typeof email !== 'string' || email.length > 254) return { ok: false, error: 'Check the email address.' };
  const result = await addManagerByEmail(user, market, email);
  revalidatePath(`/admin/markets/${slug}`);
  return result;
}

export interface AdminMarketHit {
  slug: string;
  name: string;
  city?: string;
  state?: string;
}

/** Search every market, for the admin's "edit any market" box. */
export async function adminSearchMarketsAction(query: string): Promise<AdminMarketHit[]> {
  if (!(await admin())) return [];
  const text = typeof query === 'string' ? query.trim().slice(0, 100) : '';
  if (text.length < 2) return [];
  const markets = await marketService.getAllMarkets();
  return searchMarkets(markets, text)
    .slice(0, 20)
    .map((market) => ({ slug: market.slug, name: market.name, city: market.city, state: market.state }));
}
