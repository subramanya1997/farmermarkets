import 'server-only';
import { cache } from 'react';
import { reviewQueue } from '@/lib/organizer';
import { vendorReviewQueue } from '@/lib/vendors';

/** One queue read per request, shared by the admin layout (nav count) and the review page. */
export const cachedReviewQueue = cache(reviewQueue);

export function waitingCount(queue: Awaited<ReturnType<typeof reviewQueue>>): number {
  return queue.claims.length + queue.changes.length + queue.photos.length + queue.legacyClaims.length + queue.botRequests.length;
}

/** One vendor queue read per request, shared by the layout and the review page. */
export const cachedVendorQueue = cache(vendorReviewQueue);

export function vendorWaitingCount(queue: Awaited<ReturnType<typeof vendorReviewQueue>>): number {
  return queue.profiles.length + queue.applications.length;
}
