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
npm run data:update-legacy
```

Refreshes the legacy USDA snapshot (`public/data/farmers_markets.json`) against the live USDA AMS Local Food Directory, then pings the changed URLs to IndexNow. See [Legacy USDA refresh](#legacy-usda-refresh).

Useful flags:

- `--dry-run` — report what would change and write nothing.
- `--limit N` — only consider the first `N` records. A testing affordance: it bounds every kind of work, delistings included, so a partial pass never applies a whole-dataset conclusion.
- `--fixture <path>` — read a saved upstream payload instead of the network, for offline runs.

```bash
npm run data:check
npm run test:data
npm run test:data-legacy
```

Validates the generated snapshot/checksum and runs the ingestion parser, failure-retention, and legacy-refresh tests.

```bash
npm run indexnow:ping -- --dry-run https://www.farmermarkets.app/markets/some-market
```

Submits changed URLs to IndexNow. See [Search engine setup](#search-engine-setup).

```bash
npm run test:seo
```

Runs the SEO smoke tests (`scripts/seo-smoke.mjs`) against a running server. See [Measurement](#measurement).

```bash
npm run test:market-routes
npm run test:topic-routes
```

The other two server-dependent checks: sitemap and API route coverage, and the four topic pages' counts recomputed from the snapshots.

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
| `NEXT_PUBLIC_ORG_SAMEAS` | Comma-separated absolute URLs added to `Organization.sameAs` (Wikidata item, social profiles). The public repository URL is always included; entries that are not absolute `http(s)` URLs are dropped. See [Entity presence](#entity-presence). |
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

## Measurement

Two halves: a baseline to compare against, and a smoke test that catches the regressions a baseline is too slow to notice.

### Baseline (August 2026 audit)

The numbers every later month is read against. They are the whole-property totals over the audit's 28-day window, before the T9–T19 work landed:

| Metric | August 2026 |
| --- | --- |
| Impressions | 7,023 |
| Clicks | 20 |
| CTR | 0.28% |
| Impressions at positions 6–10 | 2,215 (0.54% CTR) |
| Market-name queries | position 8–11 |
| City queries ("farmers markets in {city}") | position 40–80 |

Read as a diagnosis: the site already ranks for the market names it holds records for, and clicks are not following, so the near-term win is title and snippet quality on pages that already surface. City queries are a different problem — position 40–80 is not a CTR problem, it is a "these pages are barely in the index" problem, and the number to watch there is indexed-page count and impressions, not CTR.

### What to check monthly

**Google Search Console**

- **Performance → Search results**, filtered into query clusters rather than read as one number. Three clusters matter and they move for different reasons:
  - market-name queries (the query contains a market name) — average position and CTR; the baseline is position 8–11 with clicks not following;
  - city queries (`farmers markets in …`, `farmers market near …`) — impressions and position; the baseline is 40–80, so movement into the 20s is the signal that city pages are being taken seriously;
  - topic queries (SNAP/EBT, Saturday, hours, online ordering) — these have no baseline at all; the four topic pages are new, so any impressions are the whole result.
- **Performance → Search results → Generative AI**, the separate search-appearance type. Track it as its own series: impressions there and impressions in ordinary results move independently, and a page can gain one while losing the other.
- **Pages** (Indexing → Pages). The count that matters is *Indexed* against the ~14,000 URLs in the sitemap, and the reason breakdown underneath it. Two reasons are expected and fine — the deliberately unindexed thin city pages appear under "Excluded by 'noindex' tag", and the legacy redirects under "Page with redirect". Anything landing in "Crawled – currently not indexed" or "Discovered – currently not indexed" is the thing to investigate; that bucket growing month over month is the earliest warning that the city tier is being judged thin.

**Bing Webmaster Tools**

- **Performance → AI Performance**: citations and grounding queries. This is the only place either engine reports AI-answer inclusion directly — Google's Generative AI report gives you impressions, Bing gives you the queries and the pages actually cited. Note which page types get cited; the topic and city pages are the ones written to be extractable.
- **Sitemaps**: submitted against discovered URLs, which is the fastest way to spot a sitemap chunk that stopped being fetched.

### The smoke tests

`scripts/seo-smoke.mjs` opens a fixed sample of about 25 URLs and asserts, per URL, the things that break silently and cost months: title length and specificity, description present and free of the fragments that mean a field interpolated empty, exactly one self-referential canonical on the canonical host, a minimum internal-link count, JSON-LD that parses with no empty values, response size, and the correct robots directive for that page type — including the *presence* of `noindex` on the deliberately thin city pages and on 404s. It also checks the legacy redirects (numeric market IDs, `/markets/state/*`, uppercase paths) and the sitemap index and its chunks.

The sample is fixed and documented in the file, one entry per page shape the site serves — with-hours, no city placement, government provenance, freshness notice, unverified — so a failure names a real change rather than a different random draw.

```bash
npm run build
npm start &
npm run test:seo                                            # against localhost:3000
MARKET_BASE_URL=https://www.farmermarkets.app npm run test:seo   # against production
```

It prints a per-check pass/fail table and exits non-zero on any failure. `npm test` includes it, and it skips itself with a notice when nothing is listening, so the offline unit suites still run without a build. Setting `MARKET_BASE_URL` explicitly means you meant to hit a server, so an unreachable one fails loudly instead of skipping.

CI (`.github/workflows/ci.yml`) runs lint, `tsc --noEmit` and the offline tests, then builds, starts the server, and runs all three server-dependent checks — `test:seo`, `test:market-routes`, `test:topic-routes` — on every push to `main` and every pull request.

## Entity presence

`/about-the-data` is the page that documents the directory itself — every publisher with its record count, how records are normalized and validated, the refresh cadence, current coverage numbers, known limitations, how to report a correction, and the per-source licence terms. All of it is computed from the two snapshots at build/ISR time by `src/lib/datasetPage.ts`, so the page cannot drift from the data. It carries a `Dataset` node whose `creator` references the `Organization` `@id` declared in `src/app/layout.tsx`, and whose `distribution` names the two publicly served snapshot files. No `license` is emitted: the eight official sources carry eight different statements and the USDA records carry none, so there is no single licence to claim.

`Organization.sameAs` is built by `organizationSameAs()` in `src/lib/site.ts`. It always contains the public repository URL and adds whatever `NEXT_PUBLIC_ORG_SAMEAS` names, comma-separated. Only absolute `http(s)` URLs survive, duplicates collapse, and the key is omitted entirely if the list ever comes out empty.

`docs/entity-checklist.md` is the off-site companion: creating the Wikidata item (with the exact properties), OpenStreetMap and Overture/GERS engagement, USDA AMS options, what Bing Places does and does not do, social profiles, and honest guidance for community participation. Adding a Q-ID or profile URL to `NEXT_PUBLIC_ORG_SAMEAS` and redeploying is the only code-side step any of it needs.

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
    about-the-data/           Data provenance page and its Dataset JSON-LD
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

- `public/data/farmers_markets.json` is the legacy USDA snapshot, refreshed by `npm run data:update-legacy` (see [Legacy USDA refresh](#legacy-usda-refresh)).
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

### Legacy USDA refresh

#### Upstream availability

The legacy snapshot was long treated as unrefreshable, on the assumption that the USDA Local Food Portal had been decommissioned. That assumption was wrong, and it is worth recording why it looked true: `https://www.usdalocalfoodportal.com/` sits behind a load balancer that answers **403** to any unrecognised user agent, so every scripted probe reported the site as dead.

What is actually available today:

| Source | Status | Usable? |
| --- | --- | --- |
| `usdalocalfoodportal.com` bulk export | Live, keyless, ~18 MB JSON | **Yes** — this is what the refresh uses |
| `usdalocalfoodportal.com/api/farmersmarket/` | Live, returns `"apikey error"` | No — needs a key obtained by registration |
| data.gov "National Farmers Market Directory" | Dataset not resolvable via the CKAN API | No |
| ArcGIS `National_Farmers_Market_Directory` feature service | Live, but an Esri training copy snapshotted March 2020 | No — as stale as what we already had |

The refresh therefore reads the same keyless endpoint the directory's own CSV export button calls:

```
https://www.usdalocalfoodportal.com/api/download_by_directory/?directory=farmersmarket
```

Two practical notes for whoever maintains this. A browser `User-Agent` is required or the balancer returns 403 — the endpoint is public and unauthenticated, so this is a compatibility workaround, not an access-control bypass. And the endpoint builds the export on demand and intermittently answers 504 for a run of consecutive requests before recovering; the script retries five times with escalating backoff and requests `Accept-Encoding: identity`, which is markedly more reliable than Node's default `gzip`.

#### What the refresh does

Records are matched on `listing_id`, which is exactly the `id` on our legacy records — 6,822 of the original 6,832 matched, so this is a true refresh rather than a re-import.

The merge is deliberately conservative, because the bulk export is a *reduced* projection of the directory: it carries no contact details, no season or day schedules, no product item lists, and no parsed city/state/ZIP, all of which our snapshot does carry from the original richer export. Overwriting wholesale would destroy data. So the refresh writes only these fields and leaves everything else untouched:

`last_updated`, `name`, `location.address`, `location.coordinates`, `location.description`, `location.site_type`, `location.indoor_outdoor`, `organization.description`, `products.production_methods`, `payment.food_assistance.snap_option`.

`slug` is never regenerated for an existing record — the URL is a promise. A value is never cleared: an absent upstream field means "not exported", not "deleted".

`last_updated` is always mirrored from the upstream `update_time` and is **never** set to "now". Freshness affects both search ranking and AI-engine citation, but engines detect and discount cosmetic timestamp bumps — so a corrected address on a record the USDA did not re-date fixes the address and leaves the date alone.

Comparison is normalization-aware. The original export encoded CR as `_x000d_`, rounded coordinates, inserted a comma before the ZIP, and wrote `"Unknown"` where upstream had null. Comparing raw values marks 6,646 of 6,781 genuinely-unchanged records as changed; stripping that layer first is what makes **a second run a true no-op**, which is the property worth protecting if you modify this script.

#### Closed and delisted markets

A record the upstream no longer lists is **flagged, never deleted**: it gets `unverified: true`, and the market page renders an honest notice saying the listing is no longer published in the USDA directory and may be closed.

This is the chosen policy, over excluding the record or returning 410. The directory is self-reported, so a listing can vanish because nobody renewed it rather than because the market closed; the page still carries real value for someone searching that market by name, and deleting it would throw away a working URL on weak evidence. Honest labelling beats both silent staleness and premature deletion. Nothing is `noindex`ed.

The same notice logic (`src/lib/freshness.ts`) independently flags any record whose `last_updated` is more than four years old, whichever dataset it came from.

If the upstream ever returns drastically fewer listings than the snapshot holds, that is a broken upstream rather than a mass extinction, and the script refuses to write at all instead of flagging thousands of records.

#### Refresh cadence

Run the refresh **in early spring, before the seasonal search-volume spike**, and again mid-season:

1. **February–March** — the main pass. Markets update their listings ahead of opening day, so this is when upstream churn is highest and when the refreshed data has the longest runway before query volume peaks.
2. **June–July** — a mid-season pass to catch markets that registered late.
3. Ad hoc whenever the delisted count looks unusual.

The recommended sequence:

```bash
npm run data:update-legacy -- --dry-run   # review the report first
npm run data:update-legacy                # apply, and ping IndexNow
npm run data:geo                          # rebuild the geo index for added records
npm test && npm run build
```

Each run writes `scripts/legacy-refresh-report.json` with per-record `updated` / `added` / `delisted` / `relisted` detail and a per-field change tally. It is a per-run artifact and is gitignored, not a source of truth. Changed market, city, state, and sitemap URLs are pushed to IndexNow automatically; `INDEXNOW_DISABLE=1` turns that off, and a ping failure never fails the refresh.

## Routes

| Route | Description |
| --- | --- |
| `/` | Homepage with discovery content, popular markets, and FAQ. |
| `/markets` | Searchable and filterable market directory. |
| `/markets/[slug]` | Individual market detail page. |
| `/markets/state/[state]` | State-specific market listing page. |
| `/about` | About page. |
| `/about-the-data` | Sources, processing, refresh cadence, coverage numbers, limitations, and licence terms, with `Dataset` JSON-LD. Every number is computed from the current data at build/ISR time. |
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
- Verify `/markets`, `/markets/[slug]`, `/about-the-data`, `/api/markets`, `/sitemap.xml`, and `/robots.txt` after data or routing changes.
- Run `npm run test:seo` against a build after any change to metadata, JSON-LD, routing, or redirects — CI does it too, but it is the fastest local check that a page is still fit to index.
- Once a month, read GSC and Bing WMT against the August 2026 baseline. See [Measurement](#measurement).
- `/about-the-data` needs no editing when the data changes: its counts, source list, licence list, and date range are all recomputed from the snapshots. It does need editing if the refresh cadence or the processing rules change.
- Keep the market dataset schema aligned with the normalization logic in `src/app/api/markets/data.ts`.
- Update SEO copy and canonical URLs if the production domain changes from `farmermarkets.app`.
