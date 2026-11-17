import 'server-only';
import { cache } from 'react';
import { organizerOverview } from '@/lib/organizer';

/**
 * One overview read per request, shared by the dashboard layout (market
 * links and their "update waiting" dots) and the overview page. Keyed on the
 * session user object, which `getSessionUser` already caches per request.
 */
export const cachedOrganizerOverview = cache(organizerOverview);
