# Outreach bot API

The outreach bot (Grok) talks to market operators by email. It can:

- set someone up as an organizer for their market
  ([`POST /api/bot/organizer-access`](#organizer-access)),
- publish the listing corrections an operator sends
  ([`POST /api/bot/listing-edits`](#listing-edits)),
- publish photos an operator sends ([`POST /api/bot/photos`](#photos)),
- ask an admin to take photos down ([`POST /api/bot/photo-removals`](#photo-removals)),
- read the scoreboard ([`GET /api/bot/metrics`](#metrics)).

Every call uses the same token and error shapes ([Auth and errors](#auth-and-errors)).
Edits and photos go live at once and are logged in `bot_actions`. Anything that
takes a listing or a photo down only creates a request for an admin
([The deletion rule](#the-deletion-rule)).

## Organizer access

When someone the bot is talking to asks to update a listing, or is open to
sharing photos of the market or its vendors, the bot can set them up as an
organizer for that market in one call. They then sign in with a code sent to
their email, with no password and no review wait.

### How the person gets in

1. The bot calls the API below with the market and the person's email.
2. The bot sends them the market's claim link,
   `https://www.farmermarkets.app/markets/<slug>/claim` (also returned as
   `claim_url`), or asks the site to send it with `"notify": true`.
3. They open the link, enter the same email and type the 6 digit code we send
   them. The code proves the email is theirs.
4. They land straight in the listing editor for that market, where they can
   change hours and details and upload photos.

The same link works for anyone. Someone the bot did not set up can still sign in
there and send a claim, which waits for review in `/admin` as before.

### Request

```
POST https://www.farmermarkets.app/api/bot/organizer-access
Authorization: Bearer $ORGANIZER_BOT_TOKEN
Content-Type: application/json

{
  "market": "heart-of-the-city-market",
  "email": "manager@example.org",
  "name": "Pat Lee",
  "role": "Market manager",
  "note": "Asked to update hours by email on Nov 16; will send vendor photos.",
  "notify": false
}
```

| Field    | Required | Meaning |
|----------|----------|---------|
| `market` | yes | Market slug, or the market page URL. Old slugs of merged listings are followed. |
| `email`  | yes | The address the operator wrote from. Access is only usable from this inbox. |
| `name`   | no  | Their name, shown in `/admin`. |
| `role`   | no  | Their role at the market. Defaults to "Organizer". |
| `note`   | no  | Why the bot set them up. Kept on the approved claim for the admin's record. |
| `notify` | no  | `true` also sends our own email with the claim link. Leave it `false` when the bot's own reply includes the link, so they do not get two emails. |

Response `200`:

```json
{
  "ok": true,
  "market": { "id": "308867", "slug": "heart-of-the-city-market", "name": "Heart of the City Farmers Market" },
  "email": "manager@example.org",
  "claim_url": "https://www.farmermarkets.app/markets/heart-of-the-city-market/claim",
  "created_account": true,
  "already_manager": false,
  "notified": false
}
```

Calling it again for the same person and market is safe: it returns
`already_manager: true` and changes nothing.

Errors: see [Auth and errors](#auth-and-errors).

### What it does

- Creates an account for the email if there is none. A new account starts
  verified because it has no password; only the inbox owner can sign in, by code.
- An existing account is left as it is. If it was an unconfirmed password
  sign-up, the first code sign-in confirms it and drops that password, so a
  stranger who signed up with the operator's address first gets nothing.
- Adds them as a manager of the market and records an approved claim reviewed
  by `outreach-bot` (any claim they had waiting for that market is approved).
- Never sets up an admin address.

Listing edits they make afterwards still go to review in `/admin`, like every
organizer's.

### Rules for organizer access

- Only set someone up for the market they wrote about, and only from the address
  they wrote from. Never on a third party's say-so ("my colleague runs it").
- Only when they asked to update the listing or offered photos. Do not set up
  everyone who replies.
- Write the reason in `note`.

## Listing edits

The operator emailed a correction: new hours, a new address, a moved map pin, a
corrected name, SNAP now accepted. The bot publishes it straight to the live
listing.

```
POST https://www.farmermarkets.app/api/bot/listing-edits
Authorization: Bearer $ORGANIZER_BOT_TOKEN
Content-Type: application/json

{
  "market": "heart-of-the-city-market",
  "note": "Pat Lee (manager) emailed on Nov 18, 2026: Wednesdays now 7 to 3, new address.",
  "email": "manager@example.org",
  "changes": {
    "schedules": [{ "weekdays": ["wednesday"], "opens": "07:00", "closes": "15:00" }],
    "location": { "address": "1182 Market St", "coordinates": { "lat": 37.7793, "lon": -122.4144 } },
    "payments": { "assistance": ["snap_ebt"] }
  }
}
```

| Field            | Required | Meaning |
|------------------|----------|---------|
| `market`         | yes | Market slug or page URL. Old slugs are followed. |
| `note`           | yes | Who asked, when, and how (at least 10 characters). Shown to admins with the change. |
| `email`          | no  | The operator's address, for the record. |
| `changes`        | one of | The corrected sections (see below). |
| `remove_listing` | one of | `true` when the operator wants the listing taken down. Never published; see [The deletion rule](#the-deletion-rule). |

`changes` uses the listing editor's sections (`src/lib/listingEdits.ts`), the
admin version, so `identity` (name) and `location` (address, zip, map pin) are
allowed: `identity`, `location`, `status`, `season`, `schedules`, `about`,
`contact`, `payments`, `products`, `amenities`, `vendors`, `events`, `programs`.

- Send only what changed. In an object section (`location`, `contact`,
  `payments`, `about`, `amenities`, `products`, `vendors`, `status`,
  `identity`) the fields you send are laid over the live values and the rest
  stay as they are.
- List sections (`schedules`, `events`, `programs`) and `season` replace the
  whole list. Send every day the market is open, not just the one that moved.
- Sections that already match the live listing are skipped. If nothing differs
  the call changes nothing and returns `sections: []` and `audit_id: null`.
- Times are 24 hour (`"07:00"`), dates `YYYY-MM-DD`, weekdays lowercase.

Response `200`:

```json
{
  "ok": true,
  "pending": false,
  "market": { "id": "308867", "slug": "heart-of-the-city-market", "name": "Heart of the City Farmers Market" },
  "sections": ["location", "schedules", "payments"],
  "audit_id": "6a0c...",
  "pending_requests": []
}
```

The page updates within a minute. A `status` of `permanently_closed` is not
published: it comes back in `pending_requests` (`"action": "close_listing"`),
with `202` when nothing else was published.

## Photos

The operator sent photos of the market or its vendors. The bot uploads them and
they go live at once, credited in the caption.

```
POST https://www.farmermarkets.app/api/bot/photos
Authorization: Bearer $ORGANIZER_BOT_TOKEN
Content-Type: multipart/form-data

market=heart-of-the-city-market
note=Pat Lee sent these on Nov 18, 2026 and said we may use them.
credit=Pat Lee
alt=Produce stalls under the trees on a Wednesday morning
photo=@stalls.jpg
photo=@flowers.jpg
```

```bash
curl https://www.farmermarkets.app/api/bot/photos \
  -H "Authorization: Bearer $ORGANIZER_BOT_TOKEN" \
  -F market=heart-of-the-city-market \
  -F "note=Pat Lee sent these on Nov 18, 2026 and said we may use them." \
  -F "credit=Pat Lee" \
  -F photo=@stalls.jpg
```

| Field     | Required | Meaning |
|-----------|----------|---------|
| `market`  | yes | Market slug or page URL. |
| `note`    | yes | Who sent the photos, when, and that we may use them. |
| `photo`   | yes | One to 6 image files, repeated as `photo`. |
| `alt`     | no  | What the photo shows, for screen readers. Applies to every photo in the call, so send one call per photo when they differ. |
| `caption` | no  | Shown under the photo. |
| `credit`  | no  | Added to the caption as "Photo: <credit>". |
| `email`   | no  | The operator's address, for the record. |

- JPEG, PNG and WebP, up to 8 MB each. The type is read from the file itself.
- HEIC (iPhone) photos get `415`: convert them to JPEG first. This changes
  once the shared HEIC converter (#65) lands.
- A request body is capped at 4.5 MB by Vercel, so send large photos one per
  call, or resize them first (2000 px on the long side is plenty).
- A listing holds up to 12 photos; more than that gets `409` with how much room
  is left.

Response `200`:

```json
{
  "ok": true,
  "market": { "id": "308867", "slug": "heart-of-the-city-market", "name": "Heart of the City Farmers Market" },
  "audit_id": "9b1e...",
  "photos": [{ "id": "faf0a6ae-...", "url": "https://...public.blob.vercel-storage.com/markets/308867/bot-....jpg", "width": 2000, "height": 1500 }]
}
```

Keep the photo `id`s: they are what a later removal request refers to.

## Photo removals

The operator wants photos taken down. The bot never removes a published photo
itself; it asks an admin.

```
POST https://www.farmermarkets.app/api/bot/photo-removals
Authorization: Bearer $ORGANIZER_BOT_TOKEN
Content-Type: application/json

{
  "market": "heart-of-the-city-market",
  "note": "Pat Lee asked on Nov 20, 2026 to take down the flower stall photo.",
  "photos": ["faf0a6ae-32b2-45b8-ba72-002b169047fb"]
}
```

`photos` holds photo ids from `POST /api/bot/photos`, or the image URLs shown on
the market page (dataset photos have no id). Response `202`:

```json
{ "ok": true, "pending": true, "market": { "...": "..." }, "audit_id": "...", "matched_photo_ids": ["faf0a6ae-..."], "unmatched": [] }
```

`unmatched` lists URLs that are not uploaded photos; the admin handles those as
a data change.

## Metrics

A snapshot of where the site stands, for the growth bots to store and compare
over time. Counts only: no emails, names or message text, and no PostHog visitor
numbers (most raw pageviews are crawlers).

```
GET https://www.farmermarkets.app/api/bot/metrics
Authorization: Bearer $ORGANIZER_BOT_TOKEN
```

Response `200` (abridged):

```json
{
  "ok": true,
  "schema_version": 1,
  "generated_at": "2026-11-19T04:00:40.320Z",
  "listings": { "total": 9133, "snap_ebt": 1793, "with_override": 12, "with_approved_photos": 1138, "with_manager": 9 },
  "organizers": {
    "accounts": 40, "verified_accounts": 38, "managers": 11, "managed_markets": 9,
    "pending_claims": 2, "approved_claims": 11, "rejected_claims": 1,
    "approved_claims_by_bot": 6, "claim_approval_rate": 0.917
  },
  "edits": {
    "pending_change_requests": 1, "approved_change_requests": 14, "rejected_change_requests": 0,
    "pending_photos": 3, "approved_photos": 2632, "approved_organizer_photos": 20,
    "rejected_photos": 0, "removed_photos": 57
  },
  "bot": {
    "by_action": { "listing_edit": 8, "photo_upload": 3, "remove_listing": 1, "close_listing": 0, "remove_photos": 0 },
    "by_status": { "applied": 11, "pending": 1, "approved": 0, "dismissed": 0 },
    "pending_requests": 1
  },
  "submissions": {
    "total": 30, "pending": 4,
    "by_type": { "correction": 20, "new_market": 6, "claim": 3, "contact": 1 },
    "by_status": { "pending": 4, "reviewed": 20, "applied": 5, "rejected": 1 }
  },
  "newsletter": { "pending": 2, "confirmed": 25, "unsubscribed": 1 },
  "vendors": {
    "available": true, "profiles": 5, "live_profiles": 3,
    "by_status": { "draft": 1, "pending": 1, "approved": 3, "rejected": 0 },
    "pending_applications": 2, "approved_applications": 6, "denied_applications": 0, "withdrawn_applications": 0,
    "applications_waiting_for_admin": 1, "markets_with_approved_vendors": 4,
    "reach": { "follows": null, "qr_scans": null }
  },
  "last_7_days": { "claims": 2, "change_requests": 3, "photos": 5, "submissions": 4, "bot_actions": 6, "vendor_profiles": 1 }
}
```

What the numbers mean:

- `listings.total` and `snap_ebt` come from the published dataset, before
  organizer edits. `with_override` is markets with published edits,
  `with_approved_photos` markets with at least one live photo, `with_manager`
  markets someone manages.
- `edits.approved_photos` includes the editorial photos added by the data
  pipeline; `approved_organizer_photos` counts only uploads by signed-in organizers.
  Photos the bot published are in `bot.by_action.photo_upload` (one per call).
- `claim_approval_rate` is approved / (approved + rejected), `null` before any
  decision. `approved_claims_by_bot` are the grants from
  `POST /api/bot/organizer-access`.
- `vendors.available` is `false` (and the counts 0) on a database without the
  vendor tables. `vendors.reach` stays `null` (not tracked, which is different
  from 0) until vendor follows and QR scans exist; they will fill in there.
- `last_7_days` counts rows created in the 7 days before `generated_at`.

Fields may be added; existing ones keep their names and meaning while
`schema_version` is 1. Errors: `401` bad token, `503` database down.

## The deletion rule

The bot publishes corrections and photos. It never takes anything down. These
calls only create a request in `/admin/review` under "Bot requests", answer
`202` with `"pending": true`, and change nothing live:

| Request | How | What approving does |
|---------|-----|---------------------|
| Remove a listing | `listing-edits` with `"remove_listing": true` | Records the admin's yes. The listing comes from the dataset, so the removal itself is a data change (or a merge and redirect). |
| Mark permanently closed | `listing-edits` with `"status": { "value": "permanently_closed" }` | Publishes the closed status. |
| Remove photos | `photo-removals` | Takes the photos down and deletes their files. |

An admin can dismiss any of them instead. Merging duplicate listings is always
done by a person.

## Audit log

Every call that changes or asks for something writes one row to `bot_actions`:
the action (`listing_edit`, `photo_upload`, `remove_listing`, `close_listing`,
`remove_photos`), the market, the bot's `note`, the operator email, a summary
(sections and their new values, photo ids and URLs, never image bytes), the
status (`applied`, `pending`, `approved`, `dismissed`) and, for requests, who
decided and when. Admins see it per market under "Outreach bot" on
`/admin/markets/<slug>`, and pending requests in `/admin/review`. Published
edits are stored in `market_overrides` with `updated_by = 'outreach-bot'`.

## Auth and errors

Every endpoint takes `Authorization: Bearer $ORGANIZER_BOT_TOKEN` and answers
JSON. Errors look like `{ "error": "...", "issues": [{ "path": "...", "message": "..." }] }`
(`issues` only for `400`).

| Status | Meaning |
|--------|---------|
| `401` | Missing or wrong token, or the token is not configured. |
| `400` | Invalid body; `issues` says which field. For listing edits, paths start with `changes.`. |
| `403` | (organizer access) An admin address. |
| `404` | No market for that slug or URL. |
| `409` | (photos) The listing has no room for that many photos. |
| `413` | (photos) A file is over 8 MB. Vercel itself rejects bodies over 4.5 MB. |
| `415` | (photos) Not a JPEG, PNG or WebP, including HEIC. |
| `422` | (photos) The file is empty or not a readable image. |
| `503` | Database down; try again later. |

To find a slug, search `GET https://www.farmermarkets.app/api/markets?search=<name>`
or take it from the market page URL.

## Rules for the bot

- Only act on what the operator of that market wrote, from the address they
  wrote from. Never on a third party's say-so.
- Write the source in `note` every time: who, when, and how. Admins read it.
- Only publish photos the operator sent and said we may use; credit them.
- Take nothing down yourself: removals and closures go through the requests above.

## Testing

`scripts/bot-api.e2e.test.mjs` runs the write endpoints against a local dev server
and a non-production database, then removes what it created:

```bash
BOT_API_BASE=http://localhost:3000 node --env-file=.env.local --test scripts/bot-api.e2e.test.mjs
```

## Setup

- `ORGANIZER_BOT_TOKEN` is set in Vercel (Production and Preview) and in the
  local `.env.local`. Give the bot the same value. Rotate by changing it in both
  places; the endpoint refuses every call while it is unset or shorter than 32
  characters.
- Sign-in codes are sent by Resend from the organizer email sender, like the other
  organizer emails. Local development prints them to the server console when
  `ORGANIZER_EMAIL_LOG_ONLY=1`.
