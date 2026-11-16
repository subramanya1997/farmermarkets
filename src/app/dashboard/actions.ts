'use server';

/**
 * Server actions for signed-in market organizers. Each one re-checks the
 * session and the organizer's right to the market; nothing trusts the page
 * that called it.
 */
import { z } from 'zod';
import { marketService } from '@/app/api/markets/data';
import { searchMarkets } from '@/lib/marketSearch';
import { httpUrl } from '@/lib/listingEdits';
import { CLAIM_ROLES, CLAIM_ROLE_LABELS } from '@/lib/claimRoles';
import {
  getPublishedMarket,
  getSessionUser,
  registerPhoto,
  removePhoto,
  reorderPhotos,
  submitChangeRequest,
  submitClaim,
  updatePhotoDetails,
  type ActionResult,
} from '@/lib/organizer';

type FieldErrors = { path: string; message: string }[];
export type OrganizerActionResult = ActionResult | { ok: false; error: string; fieldErrors: FieldErrors };

async function verifiedUser() {
  const user = await getSessionUser();
  return user?.emailVerified ? user : null;
}

const SIGN_IN_ERROR: ActionResult = { ok: false, error: 'Your session ended. Sign in again to continue.' };
const UNKNOWN_MARKET: ActionResult = { ok: false, error: 'We could not find that market.' };

export interface MarketSearchHit {
  slug: string;
  name: string;
  city?: string;
  state?: string;
}

export async function searchMarketsAction(query: string): Promise<MarketSearchHit[]> {
  if (!(await verifiedUser())) return [];
  const text = query.trim().slice(0, 100);
  if (text.length < 2) return [];
  const markets = await marketService.getAllMarkets();
  return searchMarkets(markets, text)
    .slice(0, 12)
    .map((market) => ({ slug: market.slug, name: market.name, city: market.city, state: market.state }));
}

const claimSchema = z.object({
  role: z.enum(CLAIM_ROLES),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(1000).optional(),
  evidenceUrl: z.union([httpUrl, z.literal('')]).optional(),
});

export async function claimMarketAction(slug: string, input: unknown): Promise<OrganizerActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Some fields need a fix.',
      fieldErrors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  return submitClaim(user, market, { ...parsed.data, role: CLAIM_ROLE_LABELS[parsed.data.role] });
}

export async function submitListingChangesAction(slug: string, edits: unknown): Promise<OrganizerActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  return submitChangeRequest(user, market, edits);
}

const photoSchema = z.object({
  url: z.string().url().max(1000),
  pathname: z.string().max(500),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
  alt: z.string().max(200).optional(),
});

export async function registerPhotoAction(slug: string, input: unknown): Promise<ActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That upload could not be saved.' };
  return registerPhoto(user, market, parsed.data);
}

const photoDetailsSchema = z.object({
  alt: z.string().max(200).optional(),
  caption: z.string().max(200).optional(),
  sort: z.number().int().min(0).max(99).optional(),
});

export async function updatePhotoAction(slug: string, photoId: string, details: unknown): Promise<ActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  const parsed = photoDetailsSchema.safeParse(details);
  if (!parsed.success || !/^[0-9a-f-]{36}$/.test(photoId)) return { ok: false, error: 'That change could not be saved.' };
  return updatePhotoDetails(user, market, photoId, parsed.data);
}

export async function removePhotoAction(slug: string, photoId: string): Promise<ActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  if (!/^[0-9a-f-]{36}$/.test(photoId)) return { ok: false, error: 'Unknown photo.' };
  return removePhoto(user, market, photoId);
}

export async function reorderPhotosAction(slug: string, photoIds: unknown): Promise<ActionResult> {
  const user = await verifiedUser();
  if (!user) return SIGN_IN_ERROR;
  const market = await getPublishedMarket(slug);
  if (!market) return UNKNOWN_MARKET;
  const parsed = z.array(z.string().max(40)).max(50).safeParse(photoIds);
  if (!parsed.success) return { ok: false, error: 'The new order did not save.' };
  return reorderPhotos(user, market, parsed.data);
}
