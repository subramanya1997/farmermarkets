'use server';

/**
 * Server actions for signed-in vendors. Each one re-checks the session;
 * the functions in src/lib/vendors.ts then load every row by id AND owner,
 * so an id from someone else's page does nothing.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPublishedMarket, getSessionUser, isAdmin } from '@/lib/organizer';
import {
  adminVendor,
  inVendorPreview,
  PREVIEW_ERROR,
  registerDocument,
  removeDocument,
  setAnnouncementsOptOut,
  startVendor,
  submitApplication,
  submitVendorProfile,
  updateDocument,
  VENDOR_PREVIEW_COOKIE,
  VENDOR_PREVIEW_NEW,
  withdrawApplication,
  type ApplicationInput,
  type VendorActionResult,
} from '@/lib/vendors';
import { postOffering, withdrawOffering } from '@/lib/vendorOfferings';

async function verifiedUser() {
  const user = await getSessionUser();
  return user?.emailVerified ? user : null;
}

const SIGN_IN_ERROR: VendorActionResult = { ok: false, error: 'Your session ended. Sign in again to continue.' };

function refresh() {
  revalidatePath('/vendor', 'layout');
}

export async function submitVendorProfileAction(profile: unknown): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await submitVendorProfile(user, profile);
  if (result.ok) refresh();
  return result;
}

/** The first screen: name, what you sell and markets, sent together. */
export async function startVendorAction(input: unknown): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await startVendor(user, input);
  if (result.ok) refresh();
  return result;
}

export async function submitApplicationAction(slug: string, input: ApplicationInput): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return { ok: false, error: 'We could not find that market.' };
  const result = await submitApplication(user, market, {
    days: Array.isArray(input?.days) ? input.days.filter((day) => typeof day === 'string').slice(0, 7) : [],
    stall_note: typeof input?.stall_note === 'string' ? input.stall_note : '',
    message: typeof input?.message === 'string' ? input.message : '',
    documents:
      input?.documents && typeof input.documents === 'object'
        ? Object.fromEntries(Object.entries(input.documents).filter(([, id]) => typeof id === 'string').slice(0, 60))
        : {},
  });
  if (result.ok) refresh();
  return result;
}

export async function withdrawApplicationAction(applicationId: string): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await withdrawApplication(user, String(applicationId));
  if (result.ok) refresh();
  return result;
}

export async function registerDocumentAction(input: {
  pathname: string;
  contentType: string;
  size: number;
  label: string;
  expires_on?: string;
}): Promise<VendorActionResult & { documentId?: string }> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await registerDocument(user, {
    pathname: String(input?.pathname ?? '').slice(0, 500),
    contentType: String(input?.contentType ?? '').slice(0, 100),
    size: Number(input?.size ?? 0),
    label: String(input?.label ?? ''),
    expires_on: typeof input?.expires_on === 'string' ? input.expires_on : '',
  });
  if (result.ok) refresh();
  return result;
}

export async function updateDocumentAction(documentId: string, input: { label: string; expires_on?: string }): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await updateDocument(user, String(documentId), {
    label: String(input?.label ?? ''),
    expires_on: typeof input?.expires_on === 'string' ? input.expires_on : '',
  });
  if (result.ok) refresh();
  return result;
}

export async function removeDocumentAction(documentId: string): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await removeDocument(user, String(documentId));
  if (result.ok) refresh();
  return result;
}

export async function setAnnouncementsAction(optOut: boolean): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  const result = await setAnnouncementsOptOut(user, Boolean(optOut));
  if (result.ok) refresh();
  return result;
}

/** Post what the vendor is bringing; `replaces` is the post being edited. */
export async function postOfferingAction(input: unknown, replaces?: string): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  return postOffering(user, input, typeof replaces === 'string' ? replaces : undefined);
}

export async function withdrawOfferingAction(offeringId: string): Promise<VendorActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  if (await inVendorPreview(user)) return PREVIEW_ERROR;
  return withdrawOffering(user, String(offeringId));
}

/* Admin preview: see the vendor desk as any vendor, or as a new one. Read only. */

export async function startVendorPreviewAction(target: string): Promise<void> {
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect('/vendor');
  const value = target === VENDOR_PREVIEW_NEW ? target : (await adminVendor(String(target)))?.id;
  if (!value) redirect('/admin/vendors');
  (await cookies()).set(VENDOR_PREVIEW_COOKIE, value, {
    // The whole site, so vendor uploads under /api/vendor also see it and refuse.
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 12,
  });
  redirect('/vendor');
}

export async function endVendorPreviewAction(): Promise<void> {
  const store = await cookies();
  const value = store.get(VENDOR_PREVIEW_COOKIE)?.value ?? '';
  store.delete({ name: VENDOR_PREVIEW_COOKIE, path: '/' });
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect('/vendor');
  redirect(/^[0-9a-f-]{36}$/i.test(value) ? `/admin/vendors/${value}` : '/admin/vendors');
}

/** The admin picker's form: the vendor chosen in its select. */
export async function startVendorPreviewFormAction(formData: FormData): Promise<void> {
  await startVendorPreviewAction(String(formData.get('vendor') ?? ''));
}
