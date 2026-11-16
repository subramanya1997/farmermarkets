'use server';

/** Admin review actions. Each re-checks that the caller is an admin. */
import { revalidatePath } from 'next/cache';
import {
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
