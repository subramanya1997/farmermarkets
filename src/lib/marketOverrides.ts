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

export interface PublishedPhoto {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  caption?: string;
}

export interface PublishedLayer {
  edits: ListingEdits;
  updatedAt: string;
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
    layers.set(row.marketId, {
      edits: parsed.success ? parsed.data : {},
      updatedAt: row.updatedAt.toISOString().slice(0, 10),
      photos: [],
      hasOrganizer: managed.has(row.marketId),
    });
  }
  for (const photo of photos) {
    const layer =
      layers.get(photo.marketId) ??
      {
        edits: {},
        updatedAt: (photo.reviewedAt ?? photo.createdAt).toISOString().slice(0, 10),
        photos: [],
        hasOrganizer: managed.has(photo.marketId),
      };
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

export async function getPublishedLayer(marketId: string): Promise<PublishedLayer | undefined> {
  return (await getPublishedLayers()).get(marketId);
}

interface LayerMappers<M, R> {
  toRaw: (market: M) => R;
  fromRaw: (raw: R) => M;
}

/** The market as published: dataset record + approved organizer edits + photos. */
export async function applyPublishedLayer<
  M extends { id: string; slug: string; organizer?: unknown; photos?: unknown },
  R extends OverlayableMarket,
>(market: M, mappers: LayerMappers<M, R>): Promise<M> {
  const layer = await getPublishedLayer(market.id);
  if (!layer) return market;
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
  return {
    ...edited,
    organizer: { updated_at: layer.updatedAt, sections, verified: layer.hasOrganizer },
    ...(layer.photos.length ? { photos: layer.photos } : {}),
  };
}
