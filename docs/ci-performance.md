# CI performance

How long CI takes, where the time goes, and what has been tried. Read this before adding a step to `.github/workflows/ci.yml` or changing how the site builds.

## Time budget

- **Target:** the whole CI run finishes in under 2 minutes of wall time.
- **Before adding a check, answer three questions:** what failure does it catch, does something already catch it, and how many seconds does it add. Write the answer in the experiment log below.
- **Start with the long pole.** Look at a real run's step timings first (`gh run view <id> --json jobs`). Making a 10 second step instant does nothing if a 2 minute step runs beside it.

## Where the time went (measured November 16, 2026)

Run 44021216465 on `ubuntu-latest` (4 cores), one job, 230 seconds in total:

| Step | Seconds |
|---|---|
| Prerender 14,282 pages (3 workers) | 138 |
| Compile (Turbopack) | 16 |
| Lint | 15 |
| Type-check inside `next build` | 11 |
| Type-check step (`tsc --noEmit`) | 9 |
| Unit tests | 6 |
| Start server and three route checks | about 12 |
| Checkout, Node, Bun, install | about 17 |

Prerendering ran at an even pace of about 10 ms of wall time a page. Of the 14,282 pages, 9,132 are market pages and 4,920 are city pages.

## What CI does now

1. **Two jobs side by side.** `checks` runs lint, type-check and unit tests. `build` builds, serves and runs the route checks. The run takes as long as the `build` job.
2. **The CI build prerenders a sample of market pages.** `PRERENDER_MARKET_SAMPLE=500` makes `generateStaticParams` for `/markets/[slug]` return 500 markets spread evenly across the list (`src/lib/prerenderSample.ts`). Every market shares one template, and the route keeps `dynamicParams = true`, so any market the route checks ask for still renders on demand.
3. **The CI build does not type-check.** `SKIP_BUILD_TYPECHECK=1` turns off the check inside `next build`; the `checks` job runs `tsc --noEmit`.

What stays in full:

- **Production (Vercel) and the nightly data refresh** set neither variable. They prerender every page and type-check in the build. A market page that fails to render still fails the production deploy, and the previous deploy stays live.
- **City pages and state hubs** always prerender in full. Those routes use `dynamicParams = false` on purpose (unknown top-level URLs must be a static 404), so a page left out of the build would 404 in the CI server.

## Experiment log

Add a row for every experiment, including the ones that did not help.

| Date | Change | Result | Kept |
|---|---|---|---|
| 2026-11-16 | Sample 500 market pages in the CI build | Prerender went from 138 s (14,282 pages) to 62 s (5,646 pages) | Yes |
| 2026-11-16 | Skip the type-check inside the CI build | 11 s saved; the build step went from 171 s to 86 s with the sample | Yes |
| 2026-11-16 | Split lint, type-check and unit tests into a parallel job | `checks` takes 49 s beside a 109 s `build`, so it no longer adds to the wall time | Yes |

All three landed together in commit `3b64580`. Run 44032279564 took 112 seconds of wall time, against 230 for run 44021216465 before it and 201 to 257 across the eight runs before that.

What is left in the 109 second `build` job: prerendering 62 s (4,920 of the 5,646 pages are city pages), compile 17 s, setup and install about 12 s, server and route checks about 12 s.

## Considered and not done

- **Faster lint or type-check tools (Oxlint, the native TypeScript compiler).** Lint is 15 seconds and type-check 9, and both now run beside the build, not before it. Replacing them would not shorten the run. Oxlint also does not support every ESLint rule in use.
- **Bun for installs.** Already in use; install takes 3 seconds.
- **Caching `.next/cache` between runs.** Compile is 16 seconds. Restoring and saving a cache of that size has its own cost, and nobody has measured that it wins. Measure warm and cold runs before adding it.
- **Four build workers in CI.** `next.config.ts` raises the worker count to 4 on Vercel only. More workers can compete for the same cores; not measured on the GitHub runner.
- **Sampling city pages.** Not possible without making unknown top-level URLs render on demand. See above.
- **Moving off Next.js.** The site needs server rendering for accounts, the dashboards and on-demand pages. Not considered further.

## The other long wait: the production deploy

CI is a signal, not the gate: Vercel builds and deploys every push to `main` on its own, and that takes about 5 minutes. It prerenders all pages on purpose so no visitor or crawler waits on a cold render. Prerendering only the most visited markets there and rendering the rest on first request would shorten it, at the cost of a slower first hit on the long tail. That is a product and SEO decision, not a CI one.
