import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { getMarketBySlug } from '@/lib/data';
import { displayName, marketLocationLine, scheduleClause } from '@/lib/seo';
import { pickCover } from '@/lib/marketCard';

/**
 * Per-market Open Graph / Twitter card image.
 *
 * Next.js picks this file up by convention and wires the resulting URL into
 * `og:image` / `twitter:image` for `/markets/[slug]`, so the page's own
 * `generateMetadata` deliberately does NOT set `openGraph.images`.
 *
 * Deliberately **no `generateStaticParams`**: the page has 8,807 static params,
 * and exporting them here too would make `next build` rasterise 8,807 PNGs.
 * Without it Next renders each card on the first request and then serves it
 * from the ISR/CDN cache (`revalidate` below), which keeps the build at ~15s.
 *
 * Runtime is the default **nodejs**, not edge: the market lookup goes through
 * `@/lib/data`, which reads the dataset off the filesystem with `node:fs`.
 * Edge has no filesystem, so `export const runtime = 'edge'` would break this
 * route. Fonts are the ones `next/og` bundles (no network fetch at render
 * time), which keeps the route working under a strict CSP and offline builds.
 *
 * A market with organizer photos gets its cover photo full bleed, with the
 * name and place on a dark band along the bottom: a real photo is what makes
 * a shared link or a Discover card worth tapping. The photo is fetched from
 * our own Blob store; if that fails, the card falls back to the text design.
 * Next gives this file precedence over `generateMetadata`, so the photo has to
 * be drawn here rather than set as `openGraph.images` on the page.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// A static export is the only `alt` the file convention accepts, so it has to
// describe every card rather than name one market.
export const alt = 'Farmers market name, location and opening times, over its photo when it has one';
export const revalidate = 86400;

// Tailwind green palette, matching the site chrome and public/og-image.jpg.
const GREEN_900 = '#14532d';
const GREEN_800 = '#166534';
const GREEN_500 = '#22c55e';
const GREEN_300 = '#86efac';
const GREEN_50 = '#f0fdf4';

/** Cut a string on a word boundary so a 200-character name cannot overflow. */
function clamp(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const hard = value.slice(0, maxLength - 1);
  const lastSpace = hard.lastIndexOf(' ');
  return `${(lastSpace > maxLength / 2 ? hard.slice(0, lastSpace) : hard).trim()}…`;
}

/** Only our own public Blob store is fetched; a photo URL is never arbitrary. */
const PHOTO_HOST = /\.public\.blob\.vercel-storage\.com$/;
const PHOTO_TIMEOUT_MS = 5000;

/** The cover photo as a data URL, or undefined when there is none or it fails to load. */
async function coverPhotoData(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !PHOTO_HOST.test(parsed.hostname)) return undefined;
    const response = await fetch(parsed, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(jpeg|png|webp|avif)\b/.test(type)) return undefined;
    // Satori draws a WebP as a blank box, and most covers (the editorial
    // import) are WebP, so every photo goes through sharp first: cropped to
    // the card and re-encoded as JPEG, which also keeps the payload small.
    const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
      .rotate()
      .resize(size.width, size.height, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  } catch (error) {
    console.error('OG card: could not load the cover photo:', error);
    return undefined;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const market = await getMarketBySlug(slug);

  // An unknown slug still has to return an image: crawlers request this URL
  // independently of the page, and a 500 here would show as a broken card.
  const name = clamp(displayName(market?.name ?? '') || 'Farmers Market', 64);
  const location = market ? marketLocationLine(market) : undefined;
  const schedule = market ? scheduleClause(market) : undefined;

  const photo = await coverPhotoData(market?.cover_photo?.url ?? pickCover(market?.photos)?.url);
  if (photo) return photoCard(photo, name, location);

  // Long names get a smaller face so the headline still fits two lines.
  const nameFontSize = name.length > 44 ? 64 : name.length > 26 ? 78 : 92;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: `linear-gradient(135deg, ${GREEN_900} 0%, ${GREEN_800} 100%)`,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Produce motif, mirroring the static site card. */}
        <div
          style={{
            position: 'absolute',
            top: 300,
            left: 900,
            width: 200,
            height: 200,
            borderRadius: 200,
            background: GREEN_50,
            opacity: 0.14,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 430,
            left: 1040,
            width: 160,
            height: 160,
            borderRadius: 160,
            background: GREEN_500,
            opacity: 0.18,
          }}
        />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 96, height: 8, borderRadius: 4, background: GREEN_500 }} />
          <div
            style={{
              display: 'flex',
              marginTop: 36,
              fontSize: nameFontSize,
              fontWeight: 700,
              color: GREEN_50,
              lineHeight: 1.1,
              letterSpacing: -2,
              // Two lines of headline, whatever the name length.
              maxHeight: nameFontSize * 2.2,
              overflow: 'hidden',
            }}
          >
            {name}
          </div>
          {location ? (
            <div style={{ display: 'flex', marginTop: 28, fontSize: 42, color: GREEN_300 }}>
              {clamp(location, 52)}
            </div>
          ) : null}
          {schedule ? (
            <div style={{ display: 'flex', marginTop: 14, fontSize: 32, color: GREEN_300, opacity: 0.85 }}>
              {clamp(schedule, 62)}
            </div>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, fontWeight: 700, color: GREEN_50, opacity: 0.8 }}>
          farmermarkets.app
        </div>
      </div>
    ),
    size
  );
}

/** The card for a market with a photo: the photo full bleed, name and place on a band. */
function photoCard(photo: string, name: string, location: string | undefined) {
  const nameFontSize = name.length > 44 ? 50 : name.length > 26 ? 58 : 66;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'sans-serif' }}>
        <img
          src={photo}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '120px 64px 44px',
            background: 'linear-gradient(180deg, rgba(5,46,22,0) 0%, rgba(5,46,22,0.78) 45%, rgba(5,46,22,0.92) 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: nameFontSize,
              fontWeight: 700,
              color: GREEN_50,
              lineHeight: 1.1,
              letterSpacing: -1.5,
              maxHeight: nameFontSize * 2.2,
              overflow: 'hidden',
            }}
          >
            {name}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }}>
            <div style={{ display: 'flex', fontSize: 34, color: GREEN_300 }}>{location ? clamp(location, 48) : ''}</div>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: GREEN_50, opacity: 0.8 }}>
              farmermarkets.app
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
