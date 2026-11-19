# Outreach bot: setting up vendor accounts

Vendors (farms, bakers, makers) can have their own page on Farmer Markets and
be listed on the page of every market they sell at. When the outreach bot is
talking to a vendor, it can set them up in one call. They then sign in with a
code sent to their email, with no password.

Nothing the bot sends becomes public. The call creates an account and a draft.
The vendor finishes the profile themselves and it is reviewed in `/admin`
before it goes live, like every other vendor profile.

## How the vendor gets in

1. The bot calls the API below with the vendor's email and what it knows.
2. The bot sends them the sign-in link returned as `invite_url`
   (`https://www.farmermarkets.app/sign-in?next=%2Fvendor`), or asks the site
   to send it with `"notify": true`.
3. They open the link, enter the same email and type the 6 digit code we send
   them. The code proves the email is theirs.
4. They land in the vendor area with the business name and website filled in
   and the markets the bot named offered as one-tap picks.
5. They send the profile for review, apply to their markets and upload any
   documents a market asks for. Each market's organizer approves or denies
   its own vendors; markets with no organizer on the site are decided in
   `/admin`.

## API

```
POST https://www.farmermarkets.app/api/bot/vendor-access
Authorization: Bearer $ORGANIZER_BOT_TOKEN
Content-Type: application/json

{
  "email": "hello@greengoldfarm.example",
  "business_name": "Green and Gold Farm",
  "website": "https://greengoldfarm.example",
  "markets": ["heart-of-the-city-market", "https://www.farmermarkets.app/markets/alemany-farmers-market-san-francisco"],
  "notify": false
}
```

| Field           | Required | Meaning |
|-----------------|----------|---------|
| `email`         | yes | The address the vendor wrote from. The account is only usable from this inbox. |
| `business_name` | no  | Prefills the profile. The vendor can change it. |
| `website`       | no  | Prefills the profile. Ignored unless it is a full `https://` address. |
| `markets`       | no  | Up to 20 market slugs or market page URLs the vendor sells at. Old slugs of merged listings are followed. Shown to the vendor as suggestions; nothing is applied for them. |
| `notify`        | no  | `true` also sends our own invite email with the sign-in link. Leave it `false` when the bot's own reply includes the link, so they do not get two emails. |

It uses the same token as the organizer endpoint (`ORGANIZER_BOT_TOKEN`, at
least 32 characters, set in Vercel and in `.env.local`).

Response `200`:

```json
{
  "ok": true,
  "email": "hello@greengoldfarm.example",
  "vendor_id": "0b0f6c0e-5d0e-4c58-9d5e-2f6f1f0a9c11",
  "invite_url": "https://www.farmermarkets.app/sign-in?next=%2Fvendor",
  "markets": [{ "id": "308867", "slug": "heart-of-the-city-market", "name": "Heart of the City Farmers Market" }],
  "created_account": true,
  "already_vendor": false,
  "notified": false
}
```

Errors:

| Status | When |
|--------|------|
| `401`  | Missing or wrong bearer token. |
| `400`  | Body is not JSON or a field is invalid (`issues` lists which). |
| `403`  | The email belongs to an admin. |
| `404`  | One of `markets` is not a market on the site. Nothing is created. |
| `503`  | The database is not available. Try again later. |

## Behaviour to rely on

- Calling it twice for the same email is safe. The second call adds any new
  markets to the suggestions and reports `already_vendor: true`. It never
  overwrites what the vendor has typed.
- An email that already has an organizer account gets a vendor draft on the
  same account. One account can be both.
- A new account starts with a verified email, because it has no password and
  can only be entered with a code sent to that inbox.

## Rules for the bot

- Only call it for someone who wrote to us from that address and said they
  want a vendor page. Never for addresses scraped from a website.
- Do not promise a listing: the profile is reviewed, and each market decides
  its own vendors.
- Do not ask for documents by email. Vendors upload them in their account,
  where only they, the market they send them to and the site admin can open
  them.
