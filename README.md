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

## Environment Variables

The app can run locally without required environment variables. Server-side API calls derive their base URL from the following optional variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Explicit API origin for server-side requests. |
| `VERCEL_URL` | Vercel-provided deployment hostname. |
| `NEXT_PUBLIC_VERCEL_URL` | Optional public deployment hostname fallback. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Optional GA4 web-stream measurement ID override. Defaults to `G-S2P5DZTJC8`. |

For local development, the app falls back to `http://localhost:3000`.

## Analytics and discovery feedback

The app sends the same normalized events to Vercel Web Analytics and Google Analytics 4. The bundled GA4 stream is `G-S2P5DZTJC8`; `NEXT_PUBLIC_GA_MEASUREMENT_ID` can override it per deployment. Google Consent Mode v2 keeps the tag detectable while analytics storage defaults to denied for every visitor. Advertising storage, advertising user data, and ad personalization remain denied in every case. Event coverage includes:

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
- `Discovery Survey Response`, using predefined answer IDs rather than free-form text

Search values that look like email addresses or phone numbers are replaced with `[redacted]`. The one-click discovery survey stores only an `answered` marker in the visitor's browser so it is not repeatedly displayed. Every visitor must allow or decline analytics cookies before full analytics is enabled. When consent is denied, Google receives restricted cookieless signals for modeling while Vercel Analytics remains disabled. Event reporting is available in Vercel when Web Analytics and custom events are enabled, and in the configured GA4 property after deployment.

## Project Structure

```text
src/
  app/
    api/markets/              Market list and market detail API routes
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
