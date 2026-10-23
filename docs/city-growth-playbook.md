# City growth playbook

How the big metro city pages (`/{state}/{city}`) get better three times a
week. A scheduled task on the owner's Mac follows this on Monday, Wednesday
and Friday and pushes straight to `main`, which deploys. Nobody reviews the
change first, so the rules here and the checks in step 5 are the review.

The goal is the "farmers market {city}" searches in
`docs/city-growth-backlog.json`: most of those pages rank 10 to 60 today and
need to reach the top 5. Every improvement must make the page more useful to
someone planning a visit, never just longer.

## 0. Set up the workspace

Work in the dedicated worktree, never in the owner's main checkout (they and
other sessions edit it):

```bash
cd /Users/subramanya/Desktop/projects/farmermarkets
git fetch origin
git worktree list | grep -q farmermarkets-growth \
  || git worktree add --detach ../farmermarkets-growth origin/main
cd ../farmermarkets-growth
git status --short   # only an untracked package-lock.json is expected
git checkout --detach origin/main
npm install --no-audit --no-fund   # when node_modules is missing or package.json changed
```

`main` is checked out in the owner's folder, so git will not check it out a
second time: the worktree stays on a detached HEAD at `origin/main` and
publishes with `git push origin HEAD:main` (step 6). There is no committed
lockfile, so `npm ci` fails; `npm install` writes an untracked
`package-lock.json` that never gets committed.

If the worktree has uncommitted changes from a crashed run, inspect them;
discard only your own leftovers from a previous run.

## 1. Measure what earlier runs did

OpenSEO project "Farmers Market", id `18598882-419a-4aab-b7dd-0ef274044382`.

For every city in the backlog whose status is `"done"` and whose `next_check`
is today or earlier, call `get_search_console_performance` with
`dimensions: ["query"]`, `dateRange: "last_28_days"` and a page filter
`contains` `/{state}/{city}` (the URL moved from `/farmers-markets/...` on
2026-10-11, so ignore older URLs). Record clicks, impressions, CTR and average
position in a new `runs` entry, then set `next_check` four weeks out.

A city whose position has not improved after two checks goes back to
`"revisit"`. A city with a good position but CTR under 2% needs a title and
description test (step 3).

## 2. Pick the work

One city per run. In order:

1. A `"revisit"` city, oldest first.
2. Otherwise the lowest `priority` city with status `"todo"`.

When no `"todo"` city is left and OpenSEO is available, take the next 10
metro "farmers market {city}" keywords by volume with `get_keyword_metrics`,
confirm each city exists in `public/data/geo_index.json`, and append them. If
OpenSEO is unavailable, set `"needsResearch": true` and say so in the commit.

## 3. Improve the page

Allowed changes, in order of value:

**a. City guide** (`data/city-guides.json`, key `"{state}/{city}"`).
Open the official site of every market in the city (the `contact.websites`
in `public/data/farmers_markets.json`) and write up to 6 tips and up to 4
FAQs that a visitor would actually need: which markets run in winter, parking
and its cost, transit, SNAP/EBT matching programs (Double Up, Fresh Bucks,
Market Match), the biggest or oldest market and its days, pet rules,
seasonal one-offs such as holiday markets with dates. Each tip is one or two
sentences, under 200 characters, with a short label ("Parking", "Winter",
"By train"). Every tip and answer cites the page it came from by source id.
An FAQ must add a fact the tips do not already show; `npm run test:city-guides`
rejects an answer that mostly repeats the tips. On the page each source is a
small arrow link in the card corner, so keep source titles short and specific.

Be creative in what you pick, not in what you claim. Good angles: the
question a first-time visitor has; what changes in the season you are in
(the next 6 weeks); what makes this city's markets different (a public
market hall, a night market, an indoor winter market). Quote numbers and
times exactly as the source gives them. If a source is ambiguous or older
than this year, leave the fact out.

**b. Title and description.** Set `title` (max 60 chars) and `description`
(max 160) on the guide when the generated one is weak. Use `{count}` for the
market count so it stays correct after data refreshes. Lead with the city
and "Farmers Markets"; add the hook a searcher clicks for (days, hours,
parking, "Open in Winter" in the off season). When retesting a title on a
revisit, note the old one in the run log so the change can be judged.

**c. Data issues.** When an official site contradicts the dataset (address,
days, a closed market) or a well-known market in the city is missing, add an
entry to `data_issues` in the backlog. Do not edit
`public/data/farmers_markets.json` or the source snapshots by hand. If you
can follow `data/enrichment/README.md` exactly, you may add a small sourced
enrichment batch (or a missing market, under "Adding a market" there) and
rebuild with `npm run data:enrichment && npm run data:geo`; otherwise leave
it as an issue. Only add a market the public can visit: skip staff-only or
members-only markets.

**d. Internal links.** If a blog post in `src/content/blog/` names the city
or one of its markets without linking, link the first mention to the city
page or the market page.

Not allowed: changes to shared templates or components, new routes, invented
facts, filler prose, generated images, copying text from the source sites
(paraphrase in one sentence). Ideas that need a template change go into the
backlog's `ideas` list with the city that prompted them.

Copy rules: no en dashes or em dashes anywhere (use commas, colons or
parentheses), plain hyphens in ranges ("9am-2pm", "May-Oct"), title case
"Frequently Asked Questions" is the only FAQ heading, and it should read like
a person typed it.

## 4. Update the backlog

Set the city's status to `"done"`, add a `runs` entry with the date, a
one-line summary of what changed and the measurements from step 1 if any,
and set `next_check` four weeks out.

## 5. Check

```bash
npm run test:city-guides
npm run lint
npx tsc --noEmit -p .
npm run test:seo-meta
```

Then start a dev server on a free port and load the page:

```bash
npx next dev -p 3100 &
curl -s http://localhost:3100/{state}/{city} | grep -c "Know before you go"
MARKET_BASE_URL=http://localhost:3100 npm run test:seo
```

Stop the dev server afterwards. Do not run `npm run build` locally: it uploads source maps to the production
PostHog project, and the dev server checks are enough for data-only changes.

If any check fails and you cannot fix it within the rules, revert your
changes, record the failure in the city's `runs`, and stop.

## 6. Publish

```bash
git add data/city-guides.json docs/city-growth-backlog.json [any blog or enrichment files]
git commit -m "City growth: {City}, {ST}: {what changed}"
git fetch origin && git rebase origin/main
git push origin HEAD:main
```

`next dev` may rewrite `AGENTS.md`; restore it with `git checkout AGENTS.md`
rather than committing it.

End the commit message with:
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

After the push, wait for the deploy (poll the live URL for one of the new
tips, up to 10 minutes), then ping IndexNow:

```bash
npm run indexnow:ping -- https://www.farmermarkets.app/{state}/{city}
```

Finally append one line to the OpenSEO research log with
`update_project_context` (`appendResearchLog`): the date, the city, what
changed and the latest measured position.
