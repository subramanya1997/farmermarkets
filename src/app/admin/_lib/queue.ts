import 'server-only';
import { cache } from 'react';
import { reviewQueue } from '@/lib/organizer';

/** One queue read per request, shared by the admin layout (nav count) and the review page. */
export const cachedReviewQueue = cache(reviewQueue);

export function waitingCount(queue: Awaited<ReturnType<typeof reviewQueue>>): number {
  return queue.claims.length + queue.changes.length + queue.photos.length + queue.legacyClaims.length;
}
