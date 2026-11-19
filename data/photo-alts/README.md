# Editorial photo alt text

`market_photos` rows with a pathname like `markets/{id}/editorial-<sha>.webp` were imported on 2026-11-18 by a Codex Desktop session. They started with template alts ("Photo of Ballard Farmers Market"), which do nothing for Google Images.

- `drafts.json`: one draft alt per templated editorial photo, written by `scripts/draft-photo-alts.mjs` (Claude Sonnet via the local `claude` CLI, reading each photo at 800px). `kind`, `confidence` and `note` come from the model. `problems` lists house-rule checks from `scripts/lib/photo-alt.mjs` that the draft fails. Set `"skip": true` on a draft to leave that row alone.
- `provenance.json`: where each editorial photo came from (source page, original image URL, method, rights), rebuilt from the import session's manifests in `~/Documents/Codex/2026-11-18/farmermarkets-photos`.

Alt style follows the operator photos: `<market name>, <what is in the picture>`, plain words, no en or em dashes, no produce or people that are not visible.

Write reviewed drafts with:

```bash
node --env-file=.env.local scripts/apply-photo-alts.mjs --in data/photo-alts/drafts.json          # dry run, rolled back
node --env-file=.env.local scripts/apply-photo-alts.mjs --in data/photo-alts/drafts.json --apply  # commit
```

The apply script changes only `alt`, in one transaction, and only on rows whose alt still equals the drafted template, so later organizer or operator edits are never overwritten. Market pages pick up the change on their 24h ISR revalidate or the next deploy.
