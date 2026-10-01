# September 30 events, vendors and programs

The remaining authorized $24.50 funded 980 completed Parallel Core research tasks, prioritizing US/Canada markets with official websites and measured search/landing traffic. Together with the earlier $25.50 research, the campaign ledger totals $50 at the published successful-run rate. This is a task-cost estimate, not an independently reconciled invoice or account balance. No further paid calls were made.

An initial submission failed all 980 tasks on an unsupported schema keyword before research. The original reservation was released only after every run independently confirmed that error, the group had zero successes, and official pricing confirmed failed runs are unbilled. Full reconciliation receipts remain in `data/enrichment/parallel/september-rich-core/`. The corrected schema now passes a compatibility guard before paid submission.

## Published additions

| Addition | Accepted count |
|---|---:|
| Existing market records receiving new rich information | 25 |
| Dated event entries | 25 |
| Distinct event name/date/source combinations | 24 |
| Named vendors | 12 |
| Official vendor directory/weekly roster links | 8 |
| Programs and activities | 5 |

The paid addon contains 24 records; independent Westland research adds one record, its October 15 Spooktober event and Power of Produce program. Event entries can repeat across existing legacy/government aliases. This work adds information to existing venues; it does not add new venue listings. The directory remains 9,132 rows / 9,130 unique IDs. Research coverage increases from 5,200 to 5,202 IDs, and rich information from 562 to 584 unique IDs.

Bristol's 12 vendor names are a partial list from its official June 20–October 10, 2026 season. Individual attendance on a particular day is unconfirmed. The page shows six cards and expands the remaining names on demand; after the published period, the roster is labelled past and collapsed. Vendor links elsewhere point to operator directories or explicitly current weekly pages.

All retained event sources were checked live against the event name, explicit year/date and market identity. Three Findlay claims were removed for a broken source or conflicting weekdays. A stale Rose Park weekly post was removed. Brown Deer and Skokie links were corrected to season directories. Christkindl retains the operator's special-dates/hours caveat. Sources and verification dates appear with published facts; unknown timezones are not invented, past/cancelled/postponed events are labelled, and no recurring event is automatically moved into a future year.

The 980 raw outputs contained 655 empty results and many unsupported claims. Researching a market does not mean it received accepted enrichment. Per-run acceptance/rejection decisions and final output digest are retained in `data/enrichment/parallel/september-rich-selection/review.json`. Analytics metrics remain local; the committed candidate ranking contains identities, ranks and official URLs only.

## Database and verification

The additive migration creates `market_events`, `market_vendors` and `market_programs`, keyed by market and stable item ID. Each row preserves its full payload, exact source references and verification date. Date-only events remain SQL dates; only explicit-offset times become timestamps. Vendor rows also preserve roster period and attendance notes. Full market JSON and per-field facts remain available.

Sync validates the entire input, stages bounded chunks, applies one transaction with an advisory lock, verifies exact canonical counts and rolls back on failure. It retains absent market IDs and never edits submissions. An older editorial title override was found dropping new source references; source corrections now retain newer evidence, with a regression test and a post-override reference check.

Final canonical snapshot: **9,130 markets, 22,121 facts, 29 event rows, 12 vendor rows and 10 program rows**. Vendor links remain sourced facts rather than named-vendor rows. See `database-sync.md` for schema, date precision and operational instructions.

Validation includes unit suites, lint/type checks, production build, source QA, browser checks of representative event/vendor/program pages, and server SEO/route checks. Disposable PostgreSQL integration verified rollback, repeated stable keys, date precision, JSON null handling and preservation of submissions/absent markets.

The live migration and final transaction completed. Independent read-back matched all counts above, every event/vendor/program payload and provenance object, and all 29 date-only event rows with null timestamp columns. The submission count stayed at zero. Local mobile checks confirmed Bristol expansion exposes all 12 names, Westland's event/program details, Findlay's three accepted events, and no horizontal overflow. The complete test suite passed against the built server, including all 25 SEO sample URLs; market/sitemap and topic checks passed.
