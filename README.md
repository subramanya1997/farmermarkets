# Farmer Markets

Farmer Markets is a Next.js application for discovering local farmers markets. It provides searchable market listings, map-based browsing, individual market detail pages, regional landing pages, SEO metadata, structured data, sitemap generation, and JSON API endpoints backed by local snapshots.

The app is built as a public consumer directory for people who want to find nearby markets, check available products, compare payment options, and get location details before visiting.

## Features

- Use the 6,832-record legacy dataset plus a provenance-aware 1,975-record snapshot generated from 14 official government feeds across eight countries and territories.
- Search markets by name, city, state, or address.
- Filter markets by products, payment options, production methods, and amenities.
- Sort nearby markets using browser geolocation when the user grants permission.
- Switch between grid and Leaflet map views.
- View market detail pages with location, hours, product, payment, and contact information.
- Browse state-specific market pages at `/markets/state/[state]`.
- Serve API responses for market lists and individual market records.
- Generate SEO metadata, Open Graph metadata, JSON-LD structured data, robots.txt, and sitemap.xml.
- Use responsive UI components built with React, Tailwind CSS, Radix UI primitives, and lucide-react icons.

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Radix UI primitives
- Leaflet and React Leaflet
- Vercel Analytics
- Local JSON data source

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available Scripts

```bash
npm run dev
```

Starts the Next.js development server with Turbopack.

```bash
npm run build
```

Builds the production application.

```bash
npm run start
```

Starts the production server after a successful build.

```bash
npm run lint
```

Runs the configured lint command.

```bash
npm run data:update
```

Downloads enabled official sources, validates record counts and coordinates, preserves the last good records for a failed source, and atomically regenerates the official snapshot and manifest.

```bash
npm run data:check
npm run test:data
```

Validates the generated snapshot/checksum and runs the ingestion parser and failure-retention tests.

```bash
npm run indexnow:ping -- --dry-run https://www.farmermarkets.app/markets/some-market
```

Submits changed URLs to IndexNow. See [Search engine setup](#search-engine-setup).

## Environment Variables

The app can run locally without required environment variables. Server-side API calls derive their base URL from the following optional variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Explicit API origin for server-side requests. |
| `VERCEL_URL` | Vercel-provided deployment hostname. |
| `NEXT_PUBLIC_VERCEL_URL` | Optional public deployment hostname fallback. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 web-stream measurement ID override. Defaults to `G-S2P5DZTJC8`. |
| `RESEND_API_KEY` | Server-only Resend API key used to deliver discovery requests. |
| `DISCOVERY_FROM_EMAIL` | Verified sender used for discovery request emails. |
| `DISCOVERY_NOTIFICATION_EMAIL` | Private inbox that receives discovery requests. |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Google Search Console verification token. No meta tag is rendered when unset. |
| `NEXT_PUBLIC_BING_SITE_VERIFICATION` | Bing Webmaster Tools `msvalidate.01` token. No meta tag is rendered when unset. |
| `INDEXNOW_KEY` | Overrides the committed IndexNow key during a rotation. |
| `INDEXNOW_DISABLE` | Set to `1` to skip all IndexNow submissions (CI, local runs). |

For local development, the app falls back to `http://localhost:3000`.

## Search engine setup

### Bing Webmaster Tools

1. Sign in at [bing.com/webmasters](https://www.bing.com/webmasters) and add `https://www.farmermarkets.app`. The fastest path is **Import from Google Search Console** — it carries the property and the verification across, and you can skip to step 4.
2. Otherwise choose the **HTML meta tag** verification method and copy the `content` value out of the `msvalidate.01` tag Bing shows.
3. Set `NEXT_PUBLIC_BING_SITE_VERIFICATION` to that value in the Vercel project's environment variables and redeploy. The tag is rendered by `src/app/layout.tsx`; it is emitted **only** when the variable is set to a non-empty value, so nothing changes for local or preview builds that leave it unset. Then press **Verify** in Bing.
4. Under **Sitemaps**, submit `https://www.farmermarkets.app/sitemap.xml` — the sitemap index, which points at the `/sitemap/{n}.xml` chunks.
5. The **AI Performance** report (left nav, under *Performance*) is where Bing shows citations and grounding queries from AI answers — currently the only direct measurement of AI-answer inclusion available.

### Google Search Console

1. Add the `https://www.farmermarkets.app` property at [search.google.com/search-console](https://search.google.com/search-console) and pick the **HTML tag** method.
2. Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` to the `content` value of the `google-site-verification` tag, redeploy, then press **Verify**. Same rule as above: unset means no tag.
3. Submit `https://www.farmermarkets.app/sitemap.xml` under **Sitemaps**.
4. The **Generative AI** performance report lives in *Performance → Search results*, split out as its own search-appearance type.

### IndexNow

IndexNow is a push protocol: instead of waiting to be crawled, we tell participating engines which URLs changed. Bing, Yandex, Naver, Seznam and Yep consume it — **Google does not**. It is the only push channel that covers the thousands of generated city and market pages.

The key file is served from the site root at `/f2a3b61ce1ab35eb413e148b37de3f80.txt` (the committed file `public/f2a3b61ce1ab35eb413e148b37de3f80.txt`, whose body is exactly the key). Engines fetch it to verify that a submission really came from the site owner.

```bash
npm run indexnow:ping -- https://www.farmermarkets.app/markets/some-market
npm run indexnow:ping -- --dry-run https://www.farmermarkets.app/markets/some-market   # print the payload, send nothing
cat urls.txt | npm run indexnow:ping                                                   # one URL per line on stdin
```

URLs are de-duplicated, resolved against the canonical origin, filtered to the canonical host, and POSTed to `https://api.indexnow.org/indexnow` in batches of at most 10,000. `200` means submitted and `202` means accepted with the key still pending validation; `400`, `403`, `422` and `429` are printed with the reason (bad payload, key not found at `keyLocation`, URLs off-host or key mismatch, rate limited).

**Data refreshes ping automatically.** After `npm run data:update` writes a new snapshot, it compares it to the previous one, collects the markets that were added or edited, expands them into their market pages plus the city and state hubs that list them (via `public/data/geo_index.json`) plus `/sitemap.xml`, and submits that list. Deleted markets are excluded — recrawling a 404 buys nothing. The ping happens after the files are on disk and every network or HTTP failure is logged as a warning, so a refresh never fails because an engine was unreachable. Set `INDEXNOW_DISABLE=1` to switch pings off entirely (tests set it themselves).

**Rotating the key** — the constant and the served file are two halves of one fact, so rotate them together (the procedure is also documented at the top of `scripts/lib/indexnow.mjs`):

1. Generate a key: `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`.
2. Rename `public/<old>.txt` to `public/<new>.txt` and write the new key into it, with no trailing newline.
3. Update `DEFAULT_INDEXNOW_KEY` in `scripts/lib/indexnow.mjs` to match the filename.
4. Deploy before the next ping, so the key file is live when an engine verifies a submission.

For an emergency rotation without a code change, set `INDEXNOW_KEY` in the environment and upload the matching `<key>.txt` to the site root; the environment value wins over the constant.

## Analytics and discovery feedback

The deployed app sends the same normalized events to Vercel Web Analytics and Google Analytics 4. The bundled GA4 stream is `G-S2P5DZTJC8`; `NEXT_PUBLIC_GA_MEASUREMENT_ID` can override it per deployment. Both analytics providers load automatically on every production visit. Event coverage includes:

- `Market Search`, with a truncated query, result count, and selected country
- `Country Filter Changed`
- `Market Filter Changed` and `Market Filters Cleared`
- `Market View Changed`
- `Market Results Page Changed`
- `Map Marker Selected`
- `Market Detail Selected` and `Market Detail Viewed`
- `Official Market Website Opened` and `Market Directions Opened`
- `Approximate Location Resolved` or `Approximate Location Unavailable`, without latitude or longitude
- `Navigation Selected`
- `Discovery Popup Opened`, `Discovery Popup Dismissed`, and `Discovery Survey Response`, using non-identifying fields only

Search values that look like email addresses or phone numbers are replaced with `[redacted]`. The discovery modal can optionally collect a name, organization, email, phone number, and message. Those fields are sent server-side through Resend to the configured private inbox and are never included in Google or Vercel Analytics; analytics receives only answer IDs, counts, country filters, and boolean contact indicators. A `submitted` marker in browser storage prevents the modal from reappearing after a successful request. The site does not display a separate analytics consent banner. Event reporting is available in Vercel when Web Analytics and custom events are enabled, and in the configured GA4 property after deployment.

## Project Structure

```text
src/
  app/
    api/markets/              Market list and market detail API routes
    api/discovery/            Validated server-only Resend contact submissions
    markets/                  Market listing, detail, and state pages
    about/                    Static about page
    privacy/                  Static privacy page
    terms/                    Static terms page
    layout.tsx                Root layout, metadata, analytics, and shared chrome
    page.tsx                  Homepage
    robots.ts                 robots.txt generation
    sitemap.ts                sitemap.xml generation
  components/                 App components and shared UI primitives
  hooks/                      Client hooks such as geolocation
  lib/                        Data access, API client, filters, and utility helpers
public/
  data/farmers_markets.json   Source market dataset
  *.png, *.svg, *.ico         Icons, map markers, and social assets
  data/government_markets.json
                              Generated official-government snapshot
  data/government_markets.manifest.json
                              Source status, counts, retrieval times, and checksum
data/
  government-market-sources.json
                              Official source registry and safety thresholds
scripts/
  update-government-markets.mjs
                              Fetch, normalize, validate, and atomically write data
  check-government-markets.mjs
                              Validate snapshot provenance, counts, and checksum
.github/workflows/
  update-government-markets.yml
                              Nightly data refresh
```

## Data Source

The API merges two independent files at read time:

- `public/data/farmers_markets.json` is the unchanged legacy snapshot.
- `public/data/government_markets.json` is generated only from enabled sources in `data/government-market-sources.json`.

Every generated record identifies its official publisher, dataset, source record, catalog URL, data URL, and license in `provenance`. The companion manifest records each source's last retrieval result and record count, plus a SHA-256 checksum for the complete snapshot.

The enabled official sources cover Ontario, New York State, the District of Columbia/DMV program feed, California WIC-authorized farmers' markets, Lyon, Toulouse, Brussels, Dún Laoghaire-Rathdown, Upper Hutt, Hong Kong FEHD public markets, and Singapore NEA hawker centres. California, Dún Laoghaire-Rathdown, and Upper Hutt are explicitly local or program subsets rather than complete national directories. Alberta remains registered but disabled until its downloadable resource can be parsed and monitored reliably.

The shared schema also accommodates official local-food places that are not producer-only farmers markets. Their category is preserved in `organization.types`, for example `Public food market`, `Food cooperative pickup`, `Community garden`, or `Hawker centre and public market`.

Important normalized fields include:

- `id`, `slug`, and `name`
- address, city, state, ZIP code, and coordinates
- season, market days, vendor count, and site type
- products and product categories
- production methods such as organic or naturally grown
- payment methods, SNAP, WIC, SFMNP, and FMNP support
- amenities such as parking, restrooms, accessibility, and pet friendliness
- contact details, websites, online ordering, CSA, and delivery information

If the source data changes, confirm that each record still has a stable `name` and preferably a stable `slug`. Records without a slug are assigned one with `generateSlug()`.

### Nightly update behavior

The GitHub Actions workflow runs daily at 08:17 UTC and can also be started manually. It:

1. Fetches every enabled government source with timeouts and retries.
2. Normalizes source-specific fields and groups duplicate operating-day rows.
3. Rejects invalid coordinates, duplicate IDs/slugs, counts below the configured minimum, and suspicious drops versus the previous snapshot.
4. Retains the last good records for an individual failed source while allowing healthy sources to update.
5. Runs parser tests, checksum validation, and the production build before committing generated files.
6. Marks the workflow failed after committing a valid partial snapshot so source failures remain visible in GitHub Actions.

To test with pre-downloaded payloads instead of network requests, name the fixture files as listed in the source registry and run:

```bash
node scripts/update-government-markets.mjs --fixtures-dir /absolute/path/to/fixtures
```

## Routes

| Route | Description |
| --- | --- |
| `/` | Homepage with discovery content, popular markets, and FAQ. |
| `/markets` | Searchable and filterable market directory. |
| `/markets/[slug]` | Individual market detail page. |
| `/markets/state/[state]` | State-specific market listing page. |
| `/about` | About page. |
| `/privacy` | Privacy policy. |
| `/terms` | Terms page. |
| `/robots.txt` | Generated robots rules. |
| `/sitemap.xml` | Generated sitemap including market URLs. |

## API

### List Markets

```http
GET /api/markets
```

Supported query parameters:

| Parameter | Description |
| --- | --- |
| `page` | Page number. Defaults to `1`. |
| `limit` | Results per page. Defaults to `50`. |
| `search` | Matches market name, city, or state. |
| `state` | Filters by exact state name, case-insensitive. |
| `lat` | User latitude for distance sorting. |
| `lon` | User longitude for distance sorting. |

Example:

```bash
curl "http://localhost:3000/api/markets?search=austin&limit=10"
```

Response shape:

```json
{
  "data": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 10,
    "totalPages": 0
  }
}
```

### Get Market By Slug

```http
GET /api/markets/[slug]
```

Example:

```bash
curl "http://localhost:3000/api/markets/sample-market-slug"
```

Response shape:

```json
{
  "data": {
    "id": "1",
    "slug": "sample-market-slug",
    "name": "Sample Market"
  }
}
```

## Development Notes

- `src/lib/api.ts` contains the shared client-side API helpers and the `FarmerMarket` type used by client components.
- `src/app/api/markets/data.ts` contains the server-side JSON loading, normalization, filtering, pagination, and distance sorting logic used by API routes.
- `src/lib/data.ts` is a compatibility adapter used by server components.
- Leaflet map components are loaded dynamically on the client to avoid server-side rendering issues.
- The app intentionally marks key pages as dynamic and disables fetch caching because market data is read through local API routes.

## Deployment

The app is ready for a standard Next.js deployment. Vercel is the simplest target because the project already uses Next.js App Router conventions and `@vercel/analytics`.

For production:

1. Build with `npm run build`.
2. Set `NEXT_PUBLIC_API_BASE_URL` only if server-side API requests should use a fixed origin.
3. Deploy the full app, including the `public/data/farmers_markets.json` dataset and public assets.

## Maintenance Checklist

- Run `npm run build` before publishing app changes.
- Run `npm run test:data` and `npm run data:check` after changing the source registry or any parser.
- Verify `/markets`, `/markets/[slug]`, `/api/markets`, `/sitemap.xml`, and `/robots.txt` after data or routing changes.
- Keep the market dataset schema aligned with the normalization logic in `src/app/api/markets/data.ts`.
- Update SEO copy and canonical URLs if the production domain changes from `farmermarkets.app`.
