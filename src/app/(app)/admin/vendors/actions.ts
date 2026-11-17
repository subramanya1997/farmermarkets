'use server';

/**
 * Admin actions for vendor accounts. Every action re-checks that the caller
 * is an admin; src/lib/vendors.ts checks it again.
 */
import { revalidatePath } from 'next/cache';
import { getPublishedMarket, getSessionUser, isAdmin } from '@/lib/organizer';
import { resolveMarketSlug } from '@/lib/marketSlug';
import {
  decideApplication,
  decideDocument,
  decideVendorProfile,
  deleteVendor,
  inviteVendor,
  sendVendorAnnouncement,
  setVendorSuspended,
  type AnnouncementAudience,
  type VendorActionResult,
} from '@/lib/vendors';

const NOT_ALLOWED: VendorActionResult = { ok: false, error: 'Not allowed.' };

async function admin() {
  const user = await getSessionUser();
  return isAdmin(user) ? user! : null;
}

function cleanNote(note?: string): string | undefined {
  return typeof note === 'string' ? note.trim().slice(0, 1000) || undefined : undefined;
}

function refresh(vendorId?: string) {
  revalidatePath('/admin', 'layout');
  if (vendorId) revalidatePath(`/admin/vendors/${vendorId}`);
}

/** `reviewedSubmittedAt` is the ISO time of the proposal that was on the admin's screen. */
export async function decideVendorProfileAction(
  vendorId: string,
  approve: boolean,
  note: string | undefined,
  reviewedSubmittedAt: string,
): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideVendorProfile(user, String(vendorId), Boolean(approve), cleanNote(note), String(reviewedSubmittedAt ?? ''));
  if (result.ok) refresh(vendorId);
  return result;
}

export async function adminDecideApplicationAction(vendorId: string, applicationId: string, approve: boolean, note?: string): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideApplication(user, String(applicationId), Boolean(approve), cleanNote(note));
  if (result.ok) refresh(vendorId);
  return result;
}

export async function adminDecideDocumentAction(vendorId: string, submissionId: string, approve: boolean, note?: string): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await decideDocument(user, String(submissionId), Boolean(approve), cleanNote(note));
  if (result.ok) refresh(vendorId);
  return result;
}

export async function setVendorSuspendedAction(vendorId: string, suspended: boolean): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await setVendorSuspended(user, String(vendorId), Boolean(suspended));
  if (result.ok) refresh(vendorId);
  return result;
}

export async function deleteVendorAction(vendorId: string): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await deleteVendor(user, String(vendorId));
  if (result.ok) refresh();
  return result;
}

/** Invite one vendor by email. `markets` are slugs or market links, one per entry. */
export async function inviteVendorAction(input: {
  email: string;
  businessName?: string;
  markets?: string[];
  notify?: boolean;
}): Promise<VendorActionResult & { inviteUrl?: string }> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const wanted = (Array.isArray(input?.markets) ? input.markets : []).map((value) => String(value).trim()).filter(Boolean).slice(0, 20);
  const markets = [];
  for (const value of wanted) {
    const slug = resolveMarketSlug(value);
    const market = slug ? await getPublishedMarket(slug) : null;
    if (!market) return { ok: false, error: `No market found for "${value}".`, fieldErrors: [{ path: 'markets', message: `No market found for "${value}"` }] };
    markets.push(market);
  }
  const result = await inviteVendor({
    email: String(input?.email ?? ''),
    businessName: typeof input?.businessName === 'string' ? input.businessName : undefined,
    markets,
    notify: Boolean(input?.notify),
    source: 'admin-invite',
  });
  if (!result.ok) return { ok: false, error: result.error, fieldErrors: [{ path: 'email', message: result.error }] };
  refresh();
  const what = result.alreadyVendor ? 'They already have a vendor account' : result.createdAccount ? 'Account created' : 'Vendor draft added to their account';
  return {
    ok: true,
    message: `${what}. ${input?.notify ? (result.notified ? 'Invite email sent.' : 'The invite email could not be sent.') : 'No email was sent; share the link yourself.'}`,
    inviteUrl: result.inviteUrl,
  };
}

export async function sendAnnouncementAction(input: { subject: string; body: string; audience: AnnouncementAudience }): Promise<VendorActionResult> {
  const user = await admin();
  if (!user) return NOT_ALLOWED;
  const result = await sendVendorAnnouncement(user, {
    subject: String(input?.subject ?? ''),
    body: String(input?.body ?? ''),
    audience: input?.audience === 'all' ? 'all' : 'live',
  });
  if (result.ok) revalidatePath('/admin/vendors/announce');
  return result;
}
