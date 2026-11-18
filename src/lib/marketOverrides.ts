/**
 * The published organizer layer: approved listing edits and photos stored in
 * Neon, applied over the canonical dataset record whenever a market is read
 * through `marketService.getMarketBySlug` / `getMarketById`.
 *
 * Loading strategy:
 * - During `next build`, every layer is read once (one query) and kept for
 *   the whole build, so prerendering 8,800 pages costs one round trip.
 * - At runtime (ISR re-render after an approval), layers are read once per
 *   render with React `cache()`, never memoized across requests, so an
 *   approval is visible on the very next render in any instance.
 * The table is small (only markets an organizer has edited), so reading it
 * whole is cheaper than one query per market on city pages.
 */
import 'server-only';
import { cache } from 'react';
import { asc, eq } from 'drizzle-orm';
import { DatabaseUnavailableError, dbSchema, getDb } from '@/db';
import { listingEditsSchema, changedSections, type ListingEdits } from './listingEdits';
import { applyListingEdits, type OverlayableMarket } from './organizerOverlay';
import { absoluteUrl } from './site';
import { pickCover } from './marketCard';

export interface PublishedPhoto {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  caption?: string;
}

export interface PublishedLayer {
  edits: ListingEdits;
  /** When the listing edits were last approved (YYYY-MM-DD). */
  updatedAt: string;
  /**
   * The newest approval of anything in the layer, edits or photos
   * (YYYY-MM-DD). This is the date the published page last changed because
   * of the organizer, so it feeds the page's `dateModified` and the sitemap
   * `lastmod`; a photo approved after the last edit still moves it.
   */
  changedAt: string;
  photos: PublishedPhoto[];
  /** The market has at least one verified organizer (an approved claim). */
  hasOrganizer: boolean;
}

async function queryAllLayers(): Promise<Map<string, PublishedLayer>> {
  const layers = new Map<string, PublishedLayer>();
  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return layers;
    throw error;
  }

  const [overrides, photos, managers] = await Promise.all([
    db.select().from(dbSchema.marketOverrides),
    db
      .select()
      .from(dbSchema.marketPhotos)
      .where(eq(dbSchema.marketPhotos.status, 'approved'))
      .orderBy(asc(dbSchema.marketPhotos.sort), asc(dbSchema.marketPhotos.createdAt)),
    db.selectDistinct({ marketId: dbSchema.marketManagers.marketId }).from(dbSchema.marketManagers),
  ]);
  const managed = new Set(managers.map((row) => row.marketId));

  for (const row of overrides) {
    // Stored edits were validated on the way in; re-validate so a schema
    // change can never put malformed data on a public page.
    const parsed = listingEditsSchema.safeParse(row.data);
    const updatedAt = row.updatedAt.toISOString().slice(0, 10);
    layers.set(row.marketId, {
      edits: parsed.success ? parsed.data : {},
      updatedAt,
      changedAt: updatedAt,
      photos: [],
      hasOrganizer: managed.has(row.marketId),
    });
  }
  for (const photo of photos) {
    const approvedAt = (photo.reviewedAt ?? photo.createdAt).toISOString().slice(0, 10);
    const layer =
      layers.get(photo.marketId) ??
      {
        edits: {},
        updatedAt: approvedAt,
        changedAt: approvedAt,
        photos: [],
        hasOrganizer: managed.has(photo.marketId),
      };
    // YYYY-MM-DD strings compare in date order.
    if (approvedAt > layer.changedAt) layer.changedAt = approvedAt;
    layer.photos.push({
      url: photo.blobUrl,
      width: photo.width ?? undefined,
      height: photo.height ?? undefined,
      alt: photo.alt ?? undefined,
      caption: photo.caption ?? undefined,
    });
    layers.set(photo.marketId, layer);
  }
  return layers;
}

let buildLayers: Promise<Map<string, PublishedLayer>> | null = null;

const runtimeLayers = cache(queryAllLayers);

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/** Every published layer, keyed by market id. Empty when no DB is configured. */
export async function getPublishedLayers(): Promise<Map<string, PublishedLayer>> {
  if (isBuildPhase()) {
    buildLayers ??= queryAllLayers().catch((error) => {
      console.error('Could not load organizer layers during build:', error);
      return new Map();
    });
    return buildLayers;
  }
  return runtimeLayers();
}

export type CoverPhoto = Pick<PublishedPhoto, 'url' | 'width' | 'height' | 'alt'>;

/** How long one read of the organizer layers serves list requests at runtime. */
const LIST_LAYERS_TTL_MS = 5 * 60 * 1000;
let listLayers: { at: number; value: Promise<Map<string, PublishedLayer>> } | null = null;

/**
 * The organizer layers for market lists (the explorer's API pages). The
 * explorer pulls the dataset in ~10 parallel pages per visit, so at runtime
 * one read serves every request for five minutes instead of querying per
 * page; an approval reaches list cards within that window (its market page
 * revalidates at once). A failed read means plain records, never a broken list.
 */
export async function getListLayers(): Promise<Map<string, PublishedLayer>> {
  if (isBuildPhase()) return getPublishedLayers();
  const now = Date.now();
  if (!listLayers || now - listLayers.at > LIST_LAYERS_TTL_MS) {
    const value = queryAllLayers().catch((error) => {
      console.error('Could not load organizer layers for lists:', error);
      listLayers = null;
      return new Map<string, PublishedLayer>();
    });
    listLayers = { at: now, value };
  }
  return listLayers.value;
}

export async function getPublishedLayer(marketId: string): Promise<PublishedLayer | undefined> {
  return (await getPublishedLayers()).get(marketId);
}

interface LayerMappers<M, R> {
  toRaw: (market: M) => R;
  fromRaw: (raw: R) => M;
}

/** One market with its organizer layer applied: approved edits and photos. */
function applyLayer<
  M extends { id: string; slug: string; organizer?: unknown; photos?: unknown; cover_photo?: CoverPhoto },
  R extends OverlayableMarket,
>(market: M, layer: PublishedLayer, mappers: LayerMappers<M, R>): M {
  const sections = changedSections(layer.edits);
  const edited = sections.length
    ? mappers.fromRaw(
        applyListingEdits(mappers.toRaw(market), layer.edits, {
          approvedAt: layer.updatedAt,
          listingUrl: absoluteUrl(`/markets/${market.slug}`),
          editor: layer.hasOrganizer ? 'organizer' : 'farmer_markets',
        }),
      )
    : market;
  const cover = pickCover(layer.photos);
  return {
    ...edited,
    organizer: { updated_at: layer.changedAt, sections, verified: layer.hasOrganizer },
    ...(layer.photos.length ? { photos: layer.photos } : {}),
    ...(cover ? { cover_photo: { url: cover.url, width: cover.width, height: cover.height, alt: cover.alt } } : {}),
  };
}

/** The market as published: dataset record + approved organizer edits + photos. */
export async function applyPublishedLayer<
  M extends { id: string; slug: string; organizer?: unknown; photos?: unknown; cover_photo?: CoverPhoto },
  R extends OverlayableMarket,
>(market: M, mappers: LayerMappers<M, R>): Promise<M> {
  const layer = await getPublishedLayer(market.id);
  return layer ? applyLayer(market, layer, mappers) : market;
}

/**
 * A page of list records as published, so a list card says what the market
 * page says: organizer edits (hours, season) and the lead photo as its cover.
 */
export async function applyListLayers<
  M extends { id: string; slug: string; organizer?: unknown; photos?: unknown; cover_photo?: CoverPhoto },
  R extends OverlayableMarket,
>(markets: M[], mappers: LayerMappers<M, R>): Promise<M[]> {
  const layers = await getListLayers();
  if (!layers.size) return markets;
  return markets.map((market) => {
    const layer = layers.get(String(market.id));
    return layer ? applyLayer(market, layer, mappers) : market;
  });
}
