# Farmer Markets

Farmer Markets is a Next.js application for discovering local farmers markets across the United States. It provides searchable market listings, map-based browsing, individual market detail pages, state-specific landing pages, SEO metadata, structured data, sitemap generation, and JSON API endpoints backed by a local market dataset.

The app is built as a public consumer directory for people who want to find nearby markets, check available products, compare payment options, and get location details before visiting.

## Features

- Use a 6,832-record farmers market dataset from `public/data/farmers_markets.json`.
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

## Environment Variables

The app can run locally without required environment variables. Server-side API calls derive their base URL from the following optional variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Explicit API origin for server-side requests. |
| `VERCEL_URL` | Vercel-provided deployment hostname. |
| `NEXT_PUBLIC_VERCEL_URL` | Optional public deployment hostname fallback. |

For local development, the app falls back to `http://localhost:3000`.

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
```

## Data Source

The market directory is powered by `public/data/farmers_markets.json`. API routes load this file on the server, normalize each raw record, and expose a flattened `FarmerMarket` shape to the app.

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
- Verify `/markets`, `/markets/[slug]`, `/api/markets`, `/sitemap.xml`, and `/robots.txt` after data or routing changes.
- Keep the market dataset schema aligned with the normalization logic in `src/app/api/markets/data.ts`.
- Update SEO copy and canonical URLs if the production domain changes from `farmermarkets.app`.
