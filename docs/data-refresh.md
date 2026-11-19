# Data refresh runbook

How the two source snapshots behind the directory stay current, what raises an alert, and what to do when one fires.

From September to November 2026 the official refresh failed 40 runs in a row and nothing noticed: the job only went red in the Actions tab, and the site kept showing the August data. Everything below exists so that cannot happen quietly again (issue #63).

## The two snapshots

| Snapshot | Files | Refreshed by | When |
|---|---|---|---|
| Official government sources (about 2,000 records, 14 sources) | `data/sources/government_markets.json` and `.manifest.json` | `.github/workflows/update-government-markets.yml` | Automatically, 08:17 UTC on the 1st of each month, or by hand from the Actions tab |
| USDA Local Food Portal (about 7,100 records) | `data/sources/legacy_markets.json` and `legacy_markets.manifest.json` | `npm run data:update-legacy`, run by a person | By hand, in February or March and again in June or July |

Both feed `public/data/farmers_markets.json` and `public/data/geo_index.json`. Each official refresh commits to `main`, which redeploys production and rebuilds about 14,000 pages, which is why it runs monthly and not daily.

## Alerts

Two issues, each opened once and then commented on each time the problem repeats. Each closes itself when its check passes again.

| Issue title | Opened by | When |
|---|---|---|
| Official data refresh is failing | The official refresh workflow | Any step fails (install, fetch, tests, build, push), or `scripts/check-data-freshness.mjs --scope government` fails after the refresh |
| Market data is stale | `.github/workflows/data-freshness.yml`, Mondays 15:23 UTC | `scripts/check-data-freshness.mjs` fails for either snapshot |

The thresholds live at the top of `scripts/check-data-freshness.mjs`:

- **Official refresh older than 45 days.** A good snapshot is at most about 31 days old, so this is one missed run plus two weeks. It catches a schedule that stopped running.
- **Two partial runs in a row.** One partial run (a source down for the night) is only a warning in the run summary. Two in a row means the source is broken. The manifest counts the streak in `consecutive_partial_runs`, and each source counts its own in `consecutive_failures`.
- **Any one source not retrieved in 45 days.** A failed source keeps its last good records, and its `retrieved_at` stays the date of that last good retrieval. (Before #63 a failed attempt overwrote `retrieved_at`, so a dead source looked current on `/about-the-data`.)
- **USDA snapshot older than 180 days.** After a June or July pass the reminder arrives in January, in time for the spring pass.

Run the check locally at any time:

```bash
node scripts/check-data-freshness.mjs
```

## When "Official data refresh is failing" opens

1. Open the run linked in the issue and find the failing step.
2. **A source failed** (the Fetch sources log says `retained N previous records`): open its `data_url` from `data/government-market-sources.json` in a browser.
   - Moved: fix `data_url`. ArcGIS services renumber layers; in November 2026 Upper Hutt's food co-ops moved from layer 1 to 10 and its gardens from 3 to 12. List a service's layers with `<service>/FeatureServer?f=json`.
   - Gone for good: set `"enabled": false` and a `"disabled_reason"`. Its records leave the site on the next refresh.
3. **`data:consolidate` failed**: a research, override or merge record points at a market the source no longer has. The job sets `ENRICHMENT_STALE=skip` so stale research is skipped with a warning, but a merge into a missing market still fails, on purpose. Fix or remove that entry in `data/overrides/merged-markets.json`.
4. **Tests, build or push failed**: fix on a branch like any other change.
5. Rerun the workflow from the Actions tab. A clean run closes the issue.

## Running the official refresh by hand

The scheduled job does this; run it by hand to check a fix sooner than the 1st.

1. Actions tab, **Update official government market data**, **Run workflow** on `main`.
2. It takes about 10 minutes. It commits `data: refresh official government markets` to `main` (only the five generated data files), which starts a production deploy, then pings IndexNow with the changed URLs.
3. Check the run summary for warnings, then `/about-the-data` after the deploy: the "most recent retrieval" date and each source's date should be today.

To see what a refresh would do without committing anything, run the same steps locally:

```bash
ENRICHMENT_STALE=skip INDEXNOW_DISABLE=1 node scripts/update-government-markets.mjs --allow-partial
ENRICHMENT_STALE=skip npm run data:consolidate
npm run data:geo
npm test && npm run data:check && node scripts/check-data-freshness.mjs --scope government
git checkout -- data/sources public/data data/slug-redirects.json   # throw the result away
```

## Refreshing the USDA snapshot

There is no scheduled job for this one, deliberately: the USDA export is an 18 MB file built on demand that answers 504 for stretches, it has only ever been fetched from a residential connection, and each run deserves a human read of the delisted count before it ships. The weekly check makes sure nobody forgets.

1. Start from an up to date `main` on a new branch.
2. Dry run and read the summary. An unusual delisted count means a broken export, not closed markets: stop.
   ```bash
   npm run data:update-legacy -- --dry-run
   ```
   The script retries 504s five times with growing waits. If it still fails, try again later in the day.
3. Apply. This writes the snapshot, `legacy_markets.manifest.json` (the date the freshness check reads), consolidates and rebuilds the geo index:
   ```bash
   INDEXNOW_DISABLE=1 npm run data:update-legacy
   ```
4. Check:
   ```bash
   npm test && npm run data:check && node scripts/check-data-freshness.mjs --scope legacy
   ```
5. Commit `data/sources/legacy_markets.json`, `data/sources/legacy_markets.manifest.json`, `public/data/farmers_markets.json` and `public/data/geo_index.json`, and open a PR. `INDEXNOW_DISABLE=1` in step 3 keeps search engines from being asked to crawl pages that are not live yet.

The merge is conservative and never synthesizes dates; see "Legacy USDA refresh" in the README.
