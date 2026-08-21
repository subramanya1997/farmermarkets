# Entity checklist

Off-site work for the owner. The code side of this is done: `/about-the-data`
ships with a `Dataset` node, and `Organization.sameAs` in
`src/app/layout.tsx` is built from `NEXT_PUBLIC_ORG_SAMEAS` plus the public
repository URL, so each profile below starts being claimed the moment you add
its URL to that variable and redeploy.

Nothing here needs doing in order. The Wikidata item is the one with the
largest effect per hour spent.

## The positioning line

Use the same description everywhere — Wikidata, profile bios, forum posts,
emails to publishers. Consistency across surfaces is most of what makes an
entity resolvable.

> An independently maintained, regularly refreshed directory of farmers markets
> and public local-food places, built on USDA Local Food Portal directory data
> plus official government open-data portals, with normalization, geocoding
> fixes, and honest freshness labelling.

Two claims to avoid, because they are not true and both are checkable:

- **Not** "the successor to the decommissioned USDA directory." The USDA Local
  Food Portal is alive; the site refreshes against its bulk export. Claiming it
  is dead is the kind of thing a reviewer checks in thirty seconds.
- **Not** "official" or "USDA-affiliated" in any form. It is a third-party
  directory built on published data, and `/about-the-data` says so.

Short form, when you have one sentence: *a maintained, regularly refreshed
directory built on the USDA Local Food Portal directory data and official
government open data.*

## 1. Wikidata item

Wikidata applies a **sourcing** test, not Wikipedia's notability test: an item
needs to be identifiable and describable from references, not covered by the
press. A public directory with a documented data lineage clears that bar.
Wikipedia does not, and is not worth attempting.

Create at [wikidata.org/wiki/Special:NewItem](https://www.wikidata.org/wiki/Special:NewItem).

- **Label:** `Farmer Markets`
- **Description:** `online directory of farmers markets and local-food places`
  (lowercase, no article, no promotional wording — that is house style)

Statements:

| Property | Value | Note |
| --- | --- | --- |
| `P31` instance of | `online database` (Q7094076) — add `web directory` (Q327349) as a second value | Both are defensible; two values is fine |
| `P856` official website | `https://www.farmermarkets.app` | The canonical `www` host, not the apex |
| `P921` main subject | `farmers' market` (Q1522620) | |
| `P17` country / `P2541` operating area | `United States` (Q30), plus Canada (Q16), France (Q142), Belgium (Q31), Ireland (Q27), Singapore (Q334), Hong Kong (Q8646), New Zealand (Q664) | Use `P2541` operating area for the coverage list; the current country list is on `/about-the-data` |
| `P1476` title | `Farmer Markets` | Optional |
| `P571` inception | Year the site launched | Only if you can point at something dated |
| `P275` license | **leave empty** | There is no single licence for the data; do not invent one |

Add a reference on the substantive statements — `P854` reference URL pointing
at `https://www.farmermarkets.app/about-the-data` is the right one, since that
page documents the sources, coverage and cadence.

**After the item exists**, take its Q-ID URL
(`https://www.wikidata.org/wiki/Q…`) and add it to `NEXT_PUBLIC_ORG_SAMEAS` in
the Vercel project settings, then redeploy. That closes the loop: the site
points at the item and the item points at the site, which is what lets an
engine resolve them as one entity.

## 2. OpenStreetMap and Overture

**What GERS is.** Overture Maps Foundation (Amazon, Meta, Microsoft, TomTom and
others) publishes an open base map, and every feature in it carries a **GERS**
ID — Global Entity Reference System — a stable identifier for a real-world
place. It is the join key a growing number of downstream products use to
reconcile "this market" across datasets. Places data in Overture is assembled
from open sources including OSM, so what you do in OSM has a path into it.

**Why bother.** Local-place answers in AI assistants are increasingly grounded
in map data rather than in web pages. A market that exists in OSM with correct
opening hours is far more likely to be answered about correctly, and the
directory becomes more useful as a cross-reference than as a destination.

**What to actually do — in this order, and none of it is link-dropping:**

1. Do not bulk-import the directory into OSM. Unattributed mass imports are
   against OSM's import policy, would be reverted, and would burn the account.
   The [Import/Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines)
   process exists if you ever want to propose one for a single well-licensed
   source; it requires a documented plan and community sign-off on the
   `imports` mailing list first.
2. Contribute individual markets you can verify, tagged `amenity=marketplace`
   with `opening_hours`, `name`, and `website`. Survey-grade edits are welcome
   in a way that imports are not.
3. Engage where the topic already lives: the
   [`amenity=marketplace` wiki page](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dmarketplace)
   talk page, and the OSM community forum's data topic. A note that a
   cross-referencing directory exists, in a thread where that is on-topic, is
   fine; adding the URL to unrelated wiki pages is spam.
4. For Overture, the entry points are the
   [Overture Maps GitHub org](https://github.com/OvertureMaps) (data issue
   templates for corrections) and their Places task force. If you want to
   propose the directory as a source, that is a conversation to start there
   rather than a form to fill in.

## 3. USDA AMS cross-listing

The Local Food Portal is live and its directory is self-reported, which means
there is no "add your directory" slot to fill — the listings belong to the
markets. Realistic options:

- **Report data problems.** AMS accepts corrections through the Local Food
  Directories contact route on
  [usdalocalfoodportal.com](https://www.usdalocalfoodportal.com/). Sending a
  clean list of concrete problems found in the export (bad coordinates,
  duplicate listings) is a genuine contribution and starts a real relationship
  with the people who maintain the source.
- **Ask about the API key.** `usdalocalfoodportal.com/api/farmersmarket/` needs
  a registered key. Getting one would let the refresh pull the richer
  per-listing fields instead of the reduced bulk projection. Worth an email.
- **State and regional programs.** Many state agriculture departments keep
  their own "find a market" page with a links section. Those are per-state
  emails, they convert slowly, and each one is a real editorial link rather
  than a directory drop.

Do not expect a link from AMS itself; federal sites rarely link out to
third-party directories.

## 4. Bing Places — set expectations

**Bing Places is for businesses with a physical storefront, and it does not
feed ChatGPT's local answers.** ChatGPT's browsing and search grounding uses
Bing web search results plus its own index and partner data; the Bing Places
business listing product is a different system. Creating a Places entry for a
web directory would be both off-policy (no premises) and useless for AI
citation.

What does matter on the Bing side, and is already configured:

- **Bing Webmaster Tools** verification and sitemap submission — see the
  "Search engine setup" section of the README. Its **AI Performance** report is
  currently the only direct measurement of AI-answer inclusion available.
- **IndexNow** — already wired into both refresh scripts.

## 5. Social profiles

Only create profiles you will actually keep. A dead account is a weak `sameAs`
entry, not a neutral one.

Realistic set, in priority order: GitHub (done — the repository is public and
is always in `sameAs`), X/Twitter, LinkedIn page, Bluesky, Mastodon.

For each: use the exact positioning line above as the bio, link the canonical
`https://www.farmermarkets.app`, use the same logo, and add the profile URL to
`NEXT_PUBLIC_ORG_SAMEAS`. The variable is comma-separated; anything that is not
an absolute `http(s)` URL is dropped rather than emitted, so a stray handle or
Q-ID does no harm.

## 6. Reddit and forums — participate, do not post links

Reddit's search-visibility weight makes it tempting to farm, and city
subreddits ban that on sight. The honest version:

- **Answer questions you can actually answer.** "Which markets are open on
  Sunday in \<city\>?" appears constantly in city subreddits in spring. Answer it
  in the comment — name the markets, give the days and times. If the directory
  page adds something the comment cannot hold, link it once, as a source.
- **Never post a link as its own submission**, never post the same comment in
  several subreddits, and never post at all in a subreddit you have not been
  reading. Most city subreddits filter new accounts and low-karma accounts
  automatically.
- **Read each subreddit's self-promotion rule before commenting.** Several
  require a flair or a disclosure when you are connected to a linked site;
  disclose it in the comment ("I maintain this") every time.
- **Better than Reddit for this niche:** local Facebook market groups, city
  food blogs, and market managers themselves. A market manager who links the
  page from their own site is worth more than a hundred comments.

The measure of whether this is being done right: would the comment still be
useful with the link removed? If not, do not post it.

## Wiring a new profile in

1. Create the profile or item.
2. In Vercel → project → Settings → Environment Variables, set or extend
   `NEXT_PUBLIC_ORG_SAMEAS` with the URL, comma-separated. Example:
   `https://www.wikidata.org/wiki/Q123,https://x.com/farmermarkets`
3. Redeploy.
4. Confirm: view source on any page and check the `Organization` JSON-LD block
   now lists the URL under `sameAs`.
5. Re-test the page in the
   [Rich Results Test](https://search.google.com/test/rich-results) or the
   [schema.org validator](https://validator.schema.org/).
