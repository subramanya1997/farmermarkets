# SEO decision log

Why the technical-SEO surface of this site looks the way it does.

Everything here is a decision someone could reasonably reverse without knowing
it was a decision — a rule that reads like an oversight, or an obvious-looking
addition that we looked at and turned down. Each entry gives the **decision**,
the **why**, and the **revisit-when** that should bring it back up for debate.
Nothing here is permanent; it is just not free to change.

Where the decision is enforced by code, the file is named. Where it is enforced
by a test, the test is named — that is usually the thing that will tell you
first that a decision has been undone.

| # | Decision | Enforced in |
|---|---|---|
| 1 | [Canonical host is `www`](#1-canonical-host-is-www) | `src/lib/site.ts` |
| 2 | [No `llms.txt`](#2-no-llmstxt) | — (deliberate absence) |
| 3 | [robots.txt allows every crawler](#3-robotstxt-allows-every-crawler) | `src/app/robots.ts` |
| 4 | [`lastmod` is a real date or absent](#4-lastmod-is-a-real-date-or-absent) | `src/lib/sitemapEntries.ts` |
| 5 | [`dateModified` mirrors `lastmod`](#5-datemodified-mirrors-lastmod) | city/state/topic page schema |
| 6 | [`noindex` only for thin hubs and errors](#6-noindex-only-for-thin-hubs-and-errors) | `src/lib/cityPage.ts`, `src/lib/statePage.ts` |
| 7 | [Redirects are 308, not 301](#7-redirects-are-308-not-301) | `next/navigation` `permanentRedirect` |
| 8 | [Stale records get a notice, not a delete](#8-stale-records-get-a-notice-not-a-delete) | `src/lib/freshness.ts` |
| 9 | [Prerender everything, revalidate daily](#9-prerender-everything-revalidate-daily) | `generateStaticParams` + `revalidate` |
| 10 | [Generated copy: plain hyphens, tight punctuation, one FAQ heading](#10-generated-copy-plain-hyphens-tight-punctuation-one-faq-heading) | `clean()` in `src/lib/geo.ts`, `scripts/seo-smoke.mjs` |

---

## 1. Canonical host is `www`

**Decision.** `https://www.farmermarkets.app` is the canonical origin. The apex
domain 308s to it (configured in Vercel's domain settings, not in code). Every
absolute URL the app emits — `<link rel=canonical>`, `og:url`, JSON-LD `url`
and `@id`, sitemap `<loc>`, the `Sitemap:` line in robots.txt — is built from
the single `SITE_URL` constant in `src/lib/site.ts`.

**Why.** The choice between apex and `www` is arbitrary on the merits; what is
not arbitrary is picking one and never wavering. Google had already indexed the
`www` host, so choosing it meant no re-indexing and no equity to migrate. The
constant exists because the declared host *had* drifted before: different
surfaces emitted different origins, which is how a site ends up indexed twice.

**Revisit when.** Never, absent a domain change. If the domain does change, the
work is one constant plus the redirect at the edge — that is the point of
routing everything through `SITE_URL`.

## 2. No `llms.txt`

**Decision.** The site does not publish `/llms.txt`, and should not gain one on
the strength of a blog post.

**Why.** No engine consumes it. Google documented in June 2026 that Search does
not use `llms.txt`, and no other major provider has committed to it either.
Ahrefs' crawl study found ~97% of published `llms.txt` files receive zero
requests. The file is a second copy of the site's structure that nothing reads,
maintained by hand, free to go stale — a liability with no upside. The site's
actual machine-readable surface is the sitemap, the JSON-LD, and `/about-the-data`,
all of which are generated from the dataset and therefore cannot drift.

**Revisit when.** A major engine (Google, Bing, OpenAI, Anthropic, Perplexity)
announces that its crawler reads `llms.txt` and says what it does with it. Then
generate it from the same data the sitemap is built from — never by hand.

## 3. robots.txt allows every crawler

**Decision.** One `User-agent: *` block, `Allow: /`, a single
`Disallow: /api/*`, and the sitemap line. No per-agent blocks — GPTBot,
ClaudeBot, CCBot, PerplexityBot and Google-Extended are all allowed the whole
directory. The full rationale is repeated in `src/app/robots.ts` so a future
reader hits it before editing rather than after.

**Why.**

- **Retrieval crawlers gate AI-answer inclusion.** OAI-SearchBot,
  Claude-SearchBot and PerplexityBot fetch pages to answer live questions,
  exactly as Googlebot and Bingbot gate the SERP. Blocking one deletes this
  directory from that product's answers.
- **Blocking the training crawlers buys nothing.** They are not what retrieval
  reads, so disallowing them does not keep the site out of AI answers — it only
  removes it from the corpora those answers draw on. The Rutgers/Wharton study
  (December 2025) measured publishers who blocked them: **−23.1% traffic, with
  no measurable reduction in citation rates.** They paid the cost and got none
  of the protection.
- **`Google-Extended` is not an AI Overviews switch.** It governs Gemini model
  training only. AI Overviews and AI Mode are served from the ordinary Search
  index, so disallowing it forfeits Gemini grounding without removing a single
  AI Overview.
- **There is nothing here to withhold.** The content is a directory of facts
  from public datasets whose entire value is being found.

`/api/*` stays disallowed because those routes return the same records the HTML
already renders; crawling them spends budget re-reading the site in a format no
search result can use.

A `Disallow: /private/*` rule sat in this file for a long time. Nothing has ever
been served under `/private` — no route in `src/app`, no file in `public` — so
it advertised a path that does not exist. Removed rather than backfilled with a
real guard: there was nothing to guard.

**Revisit when.** The site starts hosting something non-public, or a major
engine changes what its retrieval agent does with a disallow.

## 4. `lastmod` is a real date or absent

**Decision.** A sitemap entry carries `<lastmod>` only when a truthful date
exists for it. A market's is its own `last_updated`. A city, state or topic
page's is the newest `last_updated` among the markets it lists. The static
pages and the paginated index carry **no** `lastmod` at all. Nothing is ever
stamped from the fetch time. `changefreq` and `priority` are not emitted.

**Why.** Illyes has described Google's trust in `lastmod` as binary: a domain
caught bumping it on every crawl has the signal discounted site-wide, for every
URL, including the ones that were honest. An earlier version of this sitemap
stamped `new Date()` onto every non-market entry on every request — the exact
pattern that costs a domain the signal. Omission is strictly better than a date
we cannot defend: a missing `lastmod` is "no information", a wrong one is
"do not trust this site's information". `changefreq` and `priority` are dropped
because Google has said for years that it ignores both.

**Revisit when.** Never for the fetch-time rule. Add `lastmod` to a page that
currently has none only once something in the repo genuinely records when that
page's content changed.

## 5. `dateModified` mirrors `lastmod`

**Decision.** City, state and topic pages carry a `CollectionPage` node whose
`dateModified` is the same instant the sitemap publishes as that URL's
`lastmod`. Market pages carry the equivalent on a `WebPage` node (see
`src/lib/schema.ts`). A page whose markets carry no usable date emits no
`dateModified` at all.

**Why.** Two things follow from rule 4. First, the date belongs on a
`CreativeWork` — `CollectionPage` and `WebPage` are both `WebPage`s, so they can
carry it; a `LocalBusiness`, an `AdministrativeArea` or an `ItemList` cannot,
and a validator flags `UNKNOWN_FIELD` when you try. It is the *page* whose facts
were refreshed, not the place. Second, both values are computed from the same
rule over the same source (`city.market_slugs` in the geo index), so the page's
own markup and the site's sitemap cannot tell a crawler two different stories
about one URL. The SEO smoke suite asserts that equality on live responses
rather than trusting the two code paths to stay in step.

**Revisit when.** Only if the page starts carrying content whose freshness is
genuinely independent of the records it lists — hand-written editorial copy with
its own edit date, say. Then the date is a max of the two, not a swap.

## 6. `noindex` only for thin hubs and errors

**Decision.** Four things are `noindex`: a city page holding exactly one market
that states no schedule, no season and no description of its own; a state hub
where not one market resolved to a city; 404s; and out-of-range pagination.
Everything else is indexable — **every market page, always**, including the
stale ones and the ones flagged `unverified`.

**Why.** The thin-city rule is narrow on purpose: it fires only where the page
holds nothing a searcher could not read in the SERP snippet, and a city with two
sparse markets is still a genuine comparison, which is the job the page does.
Those pages stay rendered and internally linked — the URL works, it is crawled,
it passes equity to the market page; it just does not ask to be indexed. Market
pages are never hidden: a market whose data is old is still the best available
answer to "when is the market in X open", and the honest response is the
freshness notice (rule 8), not deletion. A soft 404 — an error page returning
200, or a real 404 without a `noindex` — is the failure mode that actually
costs rankings, so the smoke suite asserts both the status and the meta tag.

**Revisit when.** The thin-city definition should be re-measured after any
dataset refresh that materially changes how many records carry schedules; it
currently covers ~2,500 pages.

## 7. Redirects are 308, not 301

**Decision.** Every permanent redirect in the app — legacy numeric market IDs,
retired `/markets/state/*` hubs, uppercase paths, state codes to state slugs —
is a 308, because that is what `permanentRedirect()` from `next/navigation`
issues.

**Why.** 308 is the method-preserving form of 301. For SEO the two are
equivalent: Google has stated it treats 301, 302, 307 and 308 alike for
canonicalization and passes signals through all of them. The practical
difference is that a 301 lets a client silently downgrade a POST to a GET and a
308 does not, which is strictly the safer default. It is written down because
"the redirects are 308s, not 301s" reads like a mistake in an audit, and it is
not one.

**Revisit when.** A client that matters is found not to follow 308 — in practice
this means very old software, and none of the search or retrieval crawlers.

## 8. Stale records get a notice, not a delete

**Decision.** A record whose `last_updated` is older than `STALE_AFTER_YEARS`
(4) renders a "may be out of date" line; a record the upstream USDA directory no
longer lists renders a stronger "no longer published" line. Both pages stay
indexable. A record with no parseable date says nothing at all.

**Why.** The dataset has a real tail: even after a full refresh against the live
directory, several hundred records genuinely carry a 2020 or 2021 stamp, because
that is when the market last updated its own listing. A page that says nothing
about that is quietly claiming a currency the data does not have. Labelling is
also the better SEO outcome than unpublishing: the page still answers the query,
and the caveat is exactly the kind of thing that earns trust from a human reader
and an extractive answer engine alike. The silence rule matters as much as the
notice: with no date to reason about, a staleness claim would be fabricated, and
no line in that module is ever built from `Date.now()`.

**Revisit when.** The 2023 bulk (the majority of records) crosses the four-year
threshold during 2027. The fix then is a refresh pass over the data, **not** a
longer threshold — moving the line to keep the notice off the pages would be
choosing the appearance of freshness over the fact of it.

## 9. Prerender everything, revalidate daily

**Decision.** Every market, city, state and topic page is prerendered at build
time (`generateStaticParams`) — the full ~14k-URL directory — with
`revalidate = 86400` and `dynamicParams = true`.

**Why.** The dataset is a versioned snapshot committed to the repo, so a full
SSG pass is both possible and correct: there is no per-request state to render.
Measured on this repo, prerendering all market pages adds ~10s to `next build`
and peaks well under 1 GB, which is not a budget worth optimising against. The
payoff is that a crawler — search or retrieval — never waits on a cold render,
and time-to-first-byte is flat across the whole directory. The 24-hour
revalidate window sits well inside the data's update cadence.
`dynamicParams = true` is the safety valve: a slug added by a data refresh, or a
legacy ID, still renders on demand and lands in the ISR cache rather than 404ing
until the next deploy.

**Revisit when.** The build gets slow enough to hurt — a much larger dataset.
The fix then is to narrow `generateStaticParams` to a deterministic subset (the
markets with schedules, or the first N by slug) and let `dynamicParams` carry
the rest, not to abandon static rendering.

## 10. Generated copy: plain hyphens, tight punctuation, one FAQ heading

**Decision.** User-facing generated copy never uses en (–) or em (—) dashes:
titles join name and place with a plain hyphen ("Durham Farmers' Market -
Durham, NC"), time and month ranges use "8am-1pm" / "May-Oct", prose reaches
for a comma, colon or parentheses instead of a dash, and table empty-cells
render "-". `clean()` in `src/lib/geo.ts` also normalizes upstream text: en/em
dashes become hyphens and whitespace before "," or "." is removed (only those
two marks, because French typography legitimately spaces ":;!?"). The FAQ
section heading is "Frequently Asked Questions" (title case) on every page.
The smoke suite bans "–", "—" and " , " in meta descriptions.

**Why.** Dash-heavy copy reads as machine-written, and the owner asked for
copy that reads the way a person would type it. The upstream data also carries
its own punctuation flaws (" , " inside NY schedule strings, one market name
with a space before its comma), so the normalization lives in the one entry
point every raw field passes through rather than in each renderer. The heading
standardization ends a homepage/city-page/topic-page inconsistency.

**Revisit when.** A locale's own typography requires different rules — the
French-spacing carve-out is already in place, and any further exception should
land in `clean()` with a test, not in an individual page.
