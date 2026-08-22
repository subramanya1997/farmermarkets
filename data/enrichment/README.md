# Market enrichment

This directory holds small, reviewable research batches. `npm run data:enrichment`
validates them against the lossless snapshots in `data/sources/` and rebuilds
the single runtime dataset at `public/data/farmers_markets.json`. Enrichment is
merged by stable market ID during that build, so a USDA or government refresh
cannot erase independently verified facts and the server does not need a
separate overlay file.

Every fact must name the page that supports it in that record's `sources`
array. Prefer the market's own site or a municipal page, record exact schedule
strings rather than collapsing different days into one time range, and omit a
field when identity or freshness is uncertain. `verified_at` is the day the
source was actually checked, not a synthetic freshness date. Set
`verification_scope` to `partial`; a field-level check must not hide an older
source-data warning for the listing as a whole.

Google Maps URLs belong in `google_maps_url`, not `contact.websites`. Social
profiles must be full URLs. Practical notes and amenity flags require an
explicit source statement; they are never inferred from the address or map.
Use a source-backed `suppress_map: true` when one legacy row now represents
several locations and any single embedded pin would mislead visitors.

Schema-v2 records keep source-backed website facts under `first_party`. Each
leaf carries its source IDs and verification date. Supported visitor facts
include structured seasons and schedules, closures and weather rules, payment
methods and food benefits, parking/transit/accessibility, amenities and pet
policies, vendor/product information, events and programs, languages,
newsletter links, canonical social profiles, and declarative FAQ answers.
Unknown facts stay absent; a missing field never means “no.”

## Archived audit workspaces

The completed `audit/` and `site-audit/` workspaces are compressed under
`archive/` with file counts and SHA-256 checksums in `archive/manifest.json`.
They are not required to serve the site. The canonical dataset builder reads
the compact audit disposition data directly from the full-market archive.

```bash
npm run data:archives:check      # verify both archives
npm run data:archives:restore    # restore audit/ and site-audit/
npm run data:archives:refresh    # verify updated folders, replace archives, remove folders
```

Restore the archives before running full-market or website audit workers,
reconciliation, promotion, or strict audit validators. Refresh the archives
afterward so no evidence is lost.

## Full-corpus audit

The archived `audit/manifest.json` and three `shard-*-input.json` files cover every ID in
the current source snapshots. Each worker writes one JSONL result for each assigned
ID. The result records URLs that were actually opened, a disposition, and only
the facts whose identity and source support were strong enough to publish.

Run `npm run data:enrichment:audit:progress` while workers are active. The strict
`npm run data:enrichment:audit:check` gate succeeds only at 100% ID coverage with
no blocked checks, duplicates, or unexpected IDs. `checked_no_verified_update` means the search
was performed but produced no publishable addition; it does not claim the field
does not exist. `identity_ambiguous` and `blocked` are explicit retry queues.

## Website and FAQ audit

The archived `site-audit/v1/manifest.json` inventories every trusted non-social website
candidate in the full corpus. The first pass renders each unique page in an
isolated gstack browser session, records its terminal disposition, and requires
both market-name and locality evidence before calling it an identity match.
The detail pass revisits exact matches and follows at most two same-site visitor
or FAQ links. It retains bounded evidence plus canonical base-page socials and
newsletter links; it does not publish raw page text.

```bash
npm run data:website-audit:prepare
npm run data:website-audit:progress
npm run data:website-detail:progress
npm run data:website-audit:promote -- --verified-at=YYYY-MM-DD
npm run data:enrichment
```

The promoter fails closed on shared or umbrella pages, weak page-level
identity, sibling-market text, footer/global claims, vendor and event hours,
past one-off events, negative payment statements, and noncanonical social
links. It emits only facts whose exact source page remains attached. Structured
hours require an explicitly sourced IANA timezone; the pipeline never guesses
one from geography.
