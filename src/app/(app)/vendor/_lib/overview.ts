import 'server-only';
import { cache } from 'react';
import { vendorOverview, type VendorApplicationView } from '@/lib/vendors';

/**
 * One vendor overview read per request, shared by the vendor layout (the
 * Markets count) and every page. Keyed on the session user object, which
 * `getSessionUser` already caches per request.
 */
export const cachedVendorOverview = cache(vendorOverview);

/** Still open, and missing a required document or holding a turned down one. */
export function needsDocument(application: VendorApplicationView): boolean {
  if (!application.market) return false;
  if (application.status !== 'pending' && application.status !== 'approved') return false;
  return application.progress.missingRequired > 0 || application.progress.rejected > 0;
}
