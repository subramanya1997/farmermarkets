# Listing bot API

The operator-growth bot (Alice) reads and fixes market pages herself through
these endpoints, instead of sending prompts to a person:

| Endpoint | What it does |
|---|---|
| [`GET /api/bot/markets/:slug`](#read-a-market) | The full editable record |
| [`GET /api/bot/markets/search?q=&city=&state=`](#search) | Find pages by name or city, to check for duplicates |
| [`PATCH /api/bot/markets/:slug`](#update-fields) | Name, operator, address, map pin, phone, website, payments, description |
| [`PUT /api/bot/markets/:slug/schedule`](#replace-the-schedule) | Weekly hours, seasonal ranges, special dates, closures |
| [`POST /api/bot/markets/:slug/photos`](#add-a-photo) | Add a photo (file or URL) with caption, credit and source |
| [`PATCH /api/bot/markets/:slug/photos`](#reorder-photos-or-set-the-cover) | Reorder photos, or set the cover |
| [`PATCH /api/bot/markets/:slug/photos/:id`](#edit-a-photo) | Caption, credit, alt text |
| [`DELETE /api/bot/markets/:slug/photos/:id`](#hide-a-photo) | Hide a photo (never a hard delete) |
| [`POST /api/bot/markets`](#create-a-market) | New market page; returns the slug and claim URL |
| [`POST /api/bot/markets/:slug/redirect`](#merge-a-duplicate) | Ask to merge a duplicate into the page we keep (301 once an admin approves) |

The older outreach endpoints (`/api/bot/listing-edits`, `/api/bot/photos`, ...)
in [organizer-bot.md](organizer-bot.md) keep working unchanged.

## Auth

```
Authorization: Bearer $ORGANIZER_BOT_TOKEN
```

The same token as the outreach endpoints. Writes are logged with actor
`outreach-bot`. A missing or wrong token gets `401`.

## Rules every write follows

- **Source note.** Every write takes `source_note` (at least 10 characters):
  who asked, when, and how, for example `"Operator email from Pat Lee
  (manager) on Nov 18, 2026"`. `operator_email` is optional, for the record.
- **Audit log.** Every write that changes something adds a row to
  `bot_actions`: who (`actor`), what (`action`), when (`created_at`), the
  source note, and in `details.changes` each changed field with its old and new
  value. The market's recent rows come back in `GET .../:slug` as
  `recent_changes`, and admins see them on `/admin/markets/<slug>`.
- **Dry run.** Add `?dry_run=true` to any write. It validates, computes the
  diff and returns it with `"dry_run": true`, and changes nothing.
- **Idempotent.** Sending the same call twice changes nothing the second time:
  `"changed": false`, `"changes": []`, `"audit_id": null`. Fields are compared
  with the live page; photos by their file's SHA-256; new markets by name, city
  and state; merges by their target.
- **Strict.** Unknown fields are rejected with `400` and an `issues` list, so a
  typo never silently does nothing.
- **Live at once.** Each write refreshes the market page (and its city and
  state pages), so the change shows on the next load.
- **No hard deletes.** Hiding a photo keeps the file and the row. Merges and
  closures need Subramanya's sign-off (see [Merge a duplicate](#merge-a-duplicate));
  marking a market permanently closed is refused (`403`): use
  `POST /api/bot/listing-edits`, which queues it for an admin.

Every write answers in one shape:

```json
{
  "ok": true,
  "changed": true,
  "dry_run": false,
  "changes": [{ "path": "contact.phone_numbers", "old": ["(510) 548-3333"], "new": ["(510) 548-1111"] }],
  "audit_id": "8ae7c5dd-...",
  "market": { "id": "301225", "slug": "north-berkeley-farmers-market-berkeley" }
}
```

Errors are `{ "error": "...", "issues": [{ "path": "...", "message": "..." }] }`
with `400` (bad input), `401`, `403`, `404` (no such market or photo), `409`
(the page was merged away, a likely duplicate, or the photo limit), `413` /
`415` / `422` (photo problems), or `503` (database down: try again later).

Slugs can also be the page URL. Old slugs from data refreshes are followed.

## Read a market

```
GET /api/bot/markets/north-berkeley-farmers-market-berkeley
```

Returns `market` with: `id`, `slug`, `url`, `claim_url`, `source` (`dataset`
or `listing_bot`), `name`, `operator_name`, `address`, `city`, `state`,
`zip_code`, `country_code`, `location_description`, `lat`, `lng`, `phone`,
`phone_numbers`, `website`, `websites`, `emails`, `payments` (`methods`,
`assistance`, `incentives`), `description`, `visitor_note`, `status`,
`timezone`, `schedule` (below), `photos` (id, url, size, caption, credit,
source note, `cover`, `position`), `organizers` (name, email, since),
`redirect` (where this page was merged to, or null), `merged_in` (slugs merged
into this page), `last_edited`, and `recent_changes`.

`schedule` is in exactly the shape the schedule PUT takes (`weekly`,
`seasonal`, `special_dates`, `closures`, `season`), plus read-only `other`
(monthly or every-other-week hours from research, which a PUT replaces),
`text` (the hours as listed now) and `season_text`. Read it, change it, send it
back.

## Search

```
GET /api/bot/markets/search?q=holiday&city=Berkeley&state=CA&limit=20
```

At least one of `q`, `city`, `state` (name or 2-letter code). Returns `total`
and `results` with `slug`, `name`, `address`, `city`, `state`, `url`, `source`,
`days` and `redirect_to` (set when the page was merged into another). Includes
pages the bot created.

## Update fields

```
PATCH /api/bot/markets/north-berkeley-farmers-market-berkeley
{
  "source_note": "Operator email from Pat Lee on Nov 18, 2026",
  "operator_name": "Ecology Center",
  "phone": "(510) 548-1111",
  "payments": { "methods": ["cash", "credit_card", "debit_card"] }
}
```

| Field | Meaning |
|---|---|
| `name` | Market name |
| `operator_name` | Who runs it. Shown as "Run by ..." and as the JSON-LD `parentOrganization`. `null` clears it. |
| `address`, `zip_code`, `location_description` | Street address, postal code, where to find it. `null` clears. |
| `lat`, `lng` | Map pin; send both. |
| `phone` / `phone_numbers` | The main number (others kept; `null` removes it), or the whole list. |
| `website` / `websites` | The main website (others kept; `null` removes it), or the whole list. https only. |
| `payments` | Any of `methods` (`cash`, `credit_card`, `debit_card`, `check`, `mobile_wallet`, `contactless`, `market_token`), `assistance` (`snap_ebt`, `wic`, `fmnp`, `sfmnp`), `incentives` (`{ name, kind: match/bonus/discount/voucher, note?, url? }`). Each list sent replaces that list; lists not sent stay. |
| `description`, `visitor_note` | About the market; a short note for visitors. `null` clears. |

City and state are not editable: they decide which city page lists a market.

## Replace the schedule

```
PUT /api/bot/markets/north-berkeley-farmers-market-berkeley/schedule
{
  "source_note": "Operator email from Pat Lee on Nov 18, 2026: holiday hours",
  "weekly": { "thursday": [{ "opens": "15:00", "closes": "19:00" }] },
  "seasonal": [{
    "start_date": "2026-11-01", "end_date": "2026-12-31", "label": "Holiday market",
    "hours": { "saturday": [{ "opens": "10:00", "closes": "15:00" }], "sunday": [{ "opens": "10:00", "closes": "15:00" }] }
  }],
  "special_dates": [{ "date": "2026-11-25", "opens": "09:00", "closes": "13:00", "note": "Thanksgiving market" }],
  "closures": [{ "date": "2026-11-26", "note": "Thanksgiving" }]
}
```

It replaces the weekly hours, seasonal ranges, special dates and closures as a
whole: send everything the market has, not just what changed (read it first
with GET). `season` (`{ "kind": "year_round" }` or
`{ "kind": "annual_range", "start": { "month": 5 }, "end": { "month": 10 } }`)
is optional; when left out, the season stays as it is.

- Times are 24 hour (`"08:00"`), dates `YYYY-MM-DD`, days lowercase. Up to 3
  windows a day.
- `special_dates[].kind`: `extra_day` (default, a market on a day it is not
  usually open) or `different_hours` (a usual day with other hours). Both take
  `end_date` for a run of days.
- `closures[]` take `date`, optional `end_date` and `note`.
- Dates already past are refused (usually a wrong year), and a date can't be
  both a special date and a closure.

What the page does with it: the hours list and FAQ show the weekly and
seasonal hours (with their dates), "Special dates" lists the upcoming closures
and extra days, and the JSON-LD carries `openingHoursSpecification` (seasonal
ranges with `validFrom`/`validThrough`) and `specialOpeningHoursSpecification`
(a closure is `opens = closes = 00:00`). Past dates drop off by themselves.

## Add a photo

Multipart with a file:

```bash
curl https://www.farmermarkets.app/api/bot/markets/north-berkeley-farmers-market-berkeley/photos \
  -H "Authorization: Bearer $LISTING_BOT_TOKEN" \
  -F "source_note=Provided by operator Pat Lee by email, Nov 18, 2026" \
  -F "caption=Stalls on Shattuck" -F "credit=Pat Lee" \
  -F photo=@stalls.jpg
```

Or JSON with an https URL to fetch:

```json
{ "source_note": "Provided by operator ...", "url": "https://example.org/stalls.jpg", "caption": "Stalls on Shattuck", "credit": "Pat Lee" }
```

Fields: `source_note` (required), `caption`, `credit` (shown as "Photo: Pat
Lee" after the caption), `alt`, `cover` (`true` puts it first). One photo per
call. JPEG, PNG, WebP or HEIC (converted to JPEG), up to 8 MB; a multipart body
is capped at 4.5 MB by Vercel, so send big photos by URL. A listing holds up to
12 photos (`409` when full). The same image sent again returns the existing
photo with `"duplicate": true`. A dry run returns the photo's size in `preview`.

## Reorder photos or set the cover

```
PATCH /api/bot/markets/:slug/photos
{ "source_note": "...", "order": ["<id>", "<id>"] }      // listed ids first, the rest after
{ "source_note": "...", "cover": "<id>" }                // move one photo to the front
```

The first photo is the cover on the page, on cards and in the share image.

## Edit a photo

```
PATCH /api/bot/markets/:slug/photos/:id
{ "source_note": "...", "caption": "...", "credit": "...", "alt": "..." }
```

`null` clears a field.

## Hide a photo

```
DELETE /api/bot/markets/:slug/photos/:id
{ "source_note": "Pat Lee asked on Nov 20, 2026 to take this one down" }
```

(or `?source_note=...`). The photo leaves the page at once; its file and row
are kept with status `removed`, so it can be brought back.

## Create a market

```
POST /api/bot/markets
{
  "source_note": "Operator email from the Ecology Center on Nov 19, 2026",
  "name": "Berkeley Holiday Market", "city": "Berkeley", "state": "CA",
  "address": "2151 Martin Luther King Jr Way", "zip_code": "94704", "lat": 37.8697, "lng": -122.273,
  "operator_name": "Ecology Center", "website": "https://ecologycenter.org",
  "timezone": "America/Los_Angeles",
  "schedule": { "seasonal": [...], "special_dates": [...] }
}
```

Also takes `phone`, `description`, `payments`, `location_description`,
`country_code` (`US` default, or `CA`) and `confirm_not_duplicate`. Returns
`market` (`id`, `slug`, `name`), `url` and `claim_url`. The slug is
`<name>-<city>` like the dataset's.

- Search first. When a market with a similar name is already listed in the
  same city, the call is refused with `409` and the candidates in `issues`;
  send `confirm_not_duplicate: true` if it really is a different market.
- Creating the same name, city and state again returns the first page
  (`"created": false`).
- `timezone` lets the page say "Open now".
- The page is live at once at `url`, and `claim_url` works for organizer
  access (`POST /api/bot/organizer-access`). It is not on the city page or in
  the sitemap until the next data refresh folds it into the dataset.

## Merge a duplicate

```
POST /api/bot/markets/north-berkeley-fm-berkeley-caca4200/redirect
{
  "source_note": "Duplicate of the Ecology Center page; Pat Lee confirmed by email on Nov 19, 2026",
  "to_slug": "north-berkeley-farmers-market-berkeley",
  "approved_by": "Subramanya"
}
```

Merges need Subramanya's sign-off, so this call never publishes one. It
queues the merge for an admin in `/admin/review` (`202`, `"pending": true`),
where approving it publishes the redirect. `approved_by` is optional and is
recorded with the request. Asking for the same merge again does not queue it
twice; a dry run returns the diff.

Once published, the duplicate's URL (and its `/claim` page) answers with a
`301` to the page we keep, within a minute everywhere. Writes to the merged
slug get `409`. Pages that were merged into the duplicate are pointed straight
at the new target, so there is never a chain.

## Storage

| What | Where |
|---|---|
| Listing fields, hours, dates | `market_overrides` (the same layer organizer and admin edits use) |
| Photos | `market_photos` (+ `credit`, `source_note`, `content_hash`) and Vercel Blob |
| New markets | `bot_markets` (a dataset-shaped record) |
| Merges | `market_redirects`, read by `src/proxy.ts` |
| Audit log | `bot_actions` |

Code: `src/lib/listingBot.ts` (database work), `src/lib/listingBotRequests.ts`
(request schemas, schedule conversion, diff; unit tested in
`listingBotRequests.test.ts`), routes under `src/app/api/bot/markets/`.
