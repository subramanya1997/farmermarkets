# September 30, 2026 enrichment and corrections

This update adds independently sourced partial facts to 112 existing listings and repairs 371 unambiguous US postal-code parsing errors. The directory still contains 9,132 records. Original government and legacy snapshots are unchanged.

## Research and budget

The authorized campaign ceiling is $50. Submitted 20 pilot and 1,000 main tasks using Parallel Core, whose published rate is $0.025 per task: $25.50 committed, leaving $24.50 of the authorized budget unused. This is a submission-cost estimate, not a reconciliation of the provider's account balance or invoice. No paid retries were submitted. All 1,020 task results were collected.

Candidates exclude existing research IDs and prioritize US/Canadian coverage, existing Search Console demand, and missing visitor information. The pilot automatically accepted two records; independent live review accepted five additional pilot leads. The main batch automatically accepted 106 records and retained 105 after review. A separate schema-v2 addon supplies Lincoln's explicitly published 2026 season and rain policy.

The main raw results include 54 model-reported closures, 342 unverifiable identities, and 498 records without sufficient authoritative identity/status evidence. Those dispositions are research leads; they do not mark directory listings closed. Review rejected the Sunnyside/Granger identity confusion, removed five generic organization phone fields and four shared social fields, and split three compound phone entries. All 106 automatic candidates received offline citation screening; official live samples supplement that screening. Not every source received a fresh browser visit, and blocked official pages remain unverified by live browsing.

## Published additions

| Fact | Listings gaining the fact |
| --- | ---: |
| Official websites | 112 |
| Published phone fields | 48 |
| Social profile fields | 78 |
| Published email fields | 2 |
| Schedule fields | 48 |
| Season fields | 31, including Lincoln's rich dated season |
| Source-backed visitor notes | 14 |
| Disputed-location map suppression | 8 |
| Rain policy | 1 |

These are counts of records with added fields, not guaranteed operating markets, successful phone calls, or fully reverified listings. Existing full-source freshness notices remain independent of partial enrichment dates. Address conflicts are described with source-backed notes; uncertain pins and precise structured location claims are suppressed rather than geocoded by guesswork.

Evidence is retained in `data/enrichment/parallel/september-core-{pilot,main}/results.jsonl`, submitted run mappings, the campaign ledger, and `september-core-main/review.json`. Each published research record cites the exact page supporting its fields. The review receipt contains before/after values, reasons, source URLs, and checksums. The promoter refuses to overwrite a reviewed batch; `--dry-run` can compare later automatic behavior without discarding reviewed corrections.

## Application corrections

- Shared schedule parsing preserves separate weekday/weekend windows, excludes closed days and one-off dated events from weekly recurrence, keeps explicit years from rolling forward, and retains exceptional/uncertain source wording without invented precise JSON-LD.
- Rich published schedules take precedence over their legacy projection. Ham Lake retains separate Wednesday and Saturday 2026 seasons; Kiwanis reports Saturday only; Market1892 retains weekday/weekend distinctions.
- Google Analytics buffers early client events until the first property configuration. Search events wait for a complete successful dataset load, retain sensitive-search redaction, and do not count a partial download as a failed search.
- Mobile detail pages place directions and the official website above the long map. Discovery uses Recommended/Best match labels and counts countries represented by the actual results. FAQ text describes available filters.
- Source-name validation accepts equivalent Unicode composition, whitespace and typographic punctuation while rejecting changed identities, missing punctuation, case/accents changes, confusable characters and wrong IDs. This addresses the observed Ontario apostrophe change that blocked nightly consolidation.
- Postal repair requires a US record, a stored five-digit ZIP equal to the leading street number, and a different explicit trailing ZIP beside the matching state. Ambiguous records are left for research.

## Verification

Final validation passed: 274 offline/unit tests, lint, TypeScript, a production build generating 14,227 static pages, 25 server-dependent SEO assertions, API/sitemap checks (9,132 market URLs and 4,991 cities), and topic-page checks. The offline SEO suite skips until a server runs; its 25 assertions were then executed against the production server. Reproduce with `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build`, and the three server-dependent checks (`test:seo`, `test:market-routes`, `test:topic-routes`) using `MARKET_BASE_URL` for the running production server.

Browser evidence from the local session confirms a queued cold-entry market view, an additional view after internal navigation, correct Ham Lake 2026 JSON-LD, Saturday-only Kiwanis schema, and a 94301 search with one result/one represented country and a settled `market_search` event. Local development observations establish application behavior, not a provider-side conversion or downstream business outcome.

Commit `17fc589` passed GitHub CI and Vercel deployment. Canonical public-site checks confirmed Market 1892's separate weekday/weekend hours and official storefront link, plus Genecco's imported-address notice and suppressed map.

## Events, activities and vendors

The follow-up adds four source-backed dated events to two existing listings: Bethel Park's indoor markets on October 20, November 17 and December 5, 2026, and West Ashley's Thanksgiving Market & Pumpkin Smash on November 22, 2026. Published local hours and event-specific venues appear with each event. Date-only values avoid inventing timezones or replacing the indoor event venue with the regular summer-market address.

Dedicated detail-page sections expose those events, five existing programs across two listings, and the existing Ferry Plaza vendor directory and Kenton weekly roster. Sources and verification dates accompany the entries. Named vendor cards are supported when a sourced roster is available; the current dataset has no named rosters. Vendor counts remain available on 28 rich listings. Bethel's expired summer roster is not presented as its unconfirmed fall lineup.

This follow-up uses no additional paid tasks and adds no directory venues. The directory remains at 9,132 records with 5,200 independently enriched IDs.

Follow-up verification passed five highlight/date tests, 31 market-fact tests, consolidation checks, full lint, TypeScript, a production build and 25 server-dependent SEO assertions. Mobile browser checks confirmed all four event cards, both vendor links, all five programs, no horizontal overflow, no console errors in the inspected session, and a queued vendor-directory click. This confirms application instrumentation, not provider receipt or a business conversion.

## Remaining priorities

The wider GA4/Search Console audit is saved locally at `.gstack/audits/2026-09-30/REPORT.md`. Outstanding priorities include defining useful actions/key events and custom dimensions, reviewing duplicate identities, resolving remaining address/schedule conflicts against operators, investigating high-impression low-click pages and blog indexing, preserving explorer state, and measuring operator-request delivery. No broad duplicate deletion, inferred amenities/timezones, or unverified closure publication is included here.
