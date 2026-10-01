# Database mirror and sourced collections

Canonical published data remains `public/data/farmers_markets.json`, compiled from government/legacy snapshots and reviewed research. SQL is a queryable mirror, not a second editing source. Visitor/operator submissions are a separate review queue and are never merged into published facts automatically.

`markets.record` preserves the full canonical record. Indexed latitude/longitude columns are null when `suppress_map` is true; the source record remains available for review. `market_facts` retains per-field values, source URLs/titles, verification date, and research batch, including rich collection provenance.

Migration `0001_market_highlights.sql` adds three tables without altering existing market, fact, or submission tables:

| Table | Stable key | Query columns | Complete source content |
|---|---|---|---|
| `market_events` | `(market_id, item_id)` | Name, kind, URL, date-only bounds, explicit-offset timestamp bounds, precision and original start/end text | `payload` includes local hours, venue, status, descriptions and other published event fields; `provenance` includes the exact referenced sources and verified date |
| `market_vendors` | `(market_id, item_id)` | Name, website, social URL, categories, seasonal flag | `payload` retains the named vendor and attendance note; `provenance` also retains roster context, dynamic-attendance qualification and their referenced sources |
| `market_programs` | `(market_id, item_id)` | Name, kind, eligibility, URL | Complete program value and its exact referenced provenance |

Item IDs are stable within each market collection. The same item ID can occur in different markets. A vendor row does not promise attendance at the next market; consumers must inspect `attendance_note`, `roster_context` and `attendance_is_dynamic`. A past or non-exhaustive roster is not an upcoming confirmed lineup.

Event time precision is explicit:

- `YYYY-MM-DD` populates `start_date`/`end_date`, with precision `date`; timestamp columns remain null.
- An ISO timestamp with `Z` or an explicit numeric offset populates `starts_at`/`ends_at`, precision `timestamp`.
- A local ISO datetime without an offset keeps its original text, precision `local_datetime`, and calendar date. No UTC time is inferred.
- Absent or unstructured dates retain precision `unknown` and original text/payload; queryable date/timestamp fields remain null. Published local hours in descriptions or `local_hours` are never assigned an inferred timezone.

## Apply and sync

Review and apply the additive migration with `bun run db:migrate` using the configured database. Generation itself is offline and uses `bun run db:generate`; never substitute schema push for the reviewed migration.

Preview mappings without connecting to any database:

```sh
node scripts/db-sync.mjs --dry-run
```

After the migration and canonical build are complete, `bun run db:sync` reads `DATABASE_URL` through the existing package command's `.env.local` loader. It uses Neon Client over WebSocket for an interactive transaction and bounded staging chunks; Node 22+ supplies the WebSocket runtime.

The entire input is mapped and validated before connecting. Empty snapshots, duplicate rich item IDs, missing source references and orphan research records are rejected. Duplicate canonical market IDs preserve the previous first-occurrence policy and are reported.

Within a single transaction, the script takes an advisory lock, stages all market/fact/collection rows in temporary tables, then upserts markets and collection items and replaces facts for the current canonical market IDs. Stale collection items are removed only for those current IDs. Exact canonical row counts are checked before commit. A staging, constraint, count or later write failure rolls back the transaction. There is no truncate, market pruning, or submission update/delete. Absent market IDs and their existing facts/items remain for explicit review; resulting total DB counts can therefore exceed the current canonical snapshot counts.

Logs contain prepared/committed counts and generic failure messages, never database credentials. After a failed or uncertain connection, verify current counts before retrying; a retry updates the same collection keys.

## Verification

```sh
node --test scripts/lib/db-projections.test.mjs scripts/lib/db-sync-transaction.test.mjs
RUN_DB_POSTGRES_TESTS=1 node --test scripts/lib/db-sync-postgres.test.mjs
```

The second command is opt-in and requires local `initdb`, `pg_ctl`, and `psql`. It creates and removes a disposable local PostgreSQL cluster via Unix socket, never uses `DATABASE_URL`, applies both migrations, checks date precision/JSON-null handling, repeats a sync to verify stable keys, retains an absent market and a seeded submission, and injects a foreign-key failure after fact deletion to prove actual rollback. Ordinary tests also inject staging/count/published-write failures and verify rollback commands.

Date-only event example (bind the caller's chosen calendar date as `$1`; the database server's timezone does not choose it):

```sql
SELECT market_id, item_id, name, start_date, payload, provenance
FROM market_events
WHERE start_precision = 'date' AND start_date >= $1::date
ORDER BY start_date, market_id;
```

This does not certify an event will occur; source status, verification age, cancellations and venue qualifiers remain part of the published payload.
