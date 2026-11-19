'use server';

import { redirect } from 'next/navigation';
import { DatabaseUnavailableError } from '@/db';
import { unsubscribeVendorByToken } from '@/lib/vendors';

/**
 * The "Stop these emails" button. The token is the authorization, so no
 * sign-in; unknown tokens get the same answer as known ones. One-click
 * unsubscribe from mail clients still posts to /api/vendor/unsubscribe.
 */
export async function stopVendorEmailsAction(token: string): Promise<void> {
  let done = true;
  try {
    if (/^[A-Za-z0-9_-]{20,100}$/.test(token)) await unsubscribeVendorByToken(token);
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
    done = false;
  }
  redirect(`/vendor-emails?status=${done ? 'stopped' : 'unavailable'}`);
}
