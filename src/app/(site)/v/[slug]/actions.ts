'use server';

/**
 * Follow and unfollow from the stall QR page. Each action re-reads the
 * session; the follower is always the signed-in account, never an id from
 * the form.
 */
import { getSessionUser } from '@/lib/organizer';
import type { VendorActionResult } from '@/lib/vendors';
import { followVendor, unfollowVendor } from '@/lib/vendorReach';

const SIGN_IN: VendorActionResult = { ok: false, error: 'Confirm your email to follow.' };

export async function followVendorAction(slug: string): Promise<VendorActionResult> {
  const user = await getSessionUser();
  if (!user) return SIGN_IN;
  return followVendor(user, String(slug));
}

export async function unfollowVendorAction(slug: string): Promise<VendorActionResult> {
  const user = await getSessionUser();
  if (!user) return SIGN_IN;
  return unfollowVendor(user, String(slug));
}
