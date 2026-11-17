# Outreach bot: setting up organizer accounts

The outreach bot (Grok) talks to market operators by email. When someone it is
talking to asks to update a listing, or is open to sharing photos of the market
or its vendors, the bot can set them up as an organizer for that market in one
call. They then sign in with a code sent to their email, with no password and
no review wait.

## How the person gets in

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

## API

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

Errors: `401` bad or missing token, `400` invalid body (with `issues`), `403`
admin address, `404` no market for that slug or URL, `503` database down.

To find a slug, search `GET https://www.farmermarkets.app/api/markets?search=<name>`
or take it from the market page URL.

## What it does

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

## Rules for the bot

- Only set someone up for the market they wrote about, and only from the address
  they wrote from. Never on a third party's say-so ("my colleague runs it").
- Only when they asked to update the listing or offered photos. Do not set up
  everyone who replies.
- Write the reason in `note`.

## Setup

- `ORGANIZER_BOT_TOKEN` is set in Vercel (Production and Preview) and in the
  local `.env.local`. Give the bot the same value. Rotate by changing it in both
  places; the endpoint refuses every call while it is unset or shorter than 32
  characters.
- Sign-in codes are sent by Resend from the organizer email sender, like the other
  organizer emails. Local development prints them to the server console when
  `ORGANIZER_EMAIL_LOG_ONLY=1`.
