# Blog playbook

How a blog post gets written and published on farmermarkets.app. A scheduled
routine follows this four times a week and pushes straight to `main`, which
deploys. Nobody reads the post first, so the rules here and the checks in
`npm run test:blog` are the review.

## 1. Pick the topic

Open `docs/blog-backlog.json` and take the first topic whose `status` is
`"todo"`. One post per run. The keywords, volumes and difficulty in that file
come from OpenSEO research.

Before writing, read the titles of every post in `src/content/blog/`. If the
topic would repeat a post that already exists, set its status to `"skipped"`
with a `note` and take the next one.

Alternate clusters where you can: do not publish three storage posts in a row
while other clusters still have open topics.

When fewer than 8 `"todo"` topics remain:

- If OpenSEO tools are available in the session, research up to 5 new seed
  keywords for the "Farmers Market" project (farmermarkets.app), and append
  the 12 best new informational keywords (clear reader question, difficulty
  under 40, not a brand or a single named market) as `"todo"` topics.
- If they are not, set `"needsResearch": true` at the top of the backlog and
  say so in the commit message. Do not invent keywords or volumes.

## 2. Write the post

File: `src/content/blog/<slug>.md`. The slug is the keyword in kebab-case,
trimmed to what a person would type. Frontmatter:

```
---
title: "How to Store Garlic So It Lasts for Months"
description: "One or two sentences, 110 to 165 characters, that answer the question."
publishedAt: 2026-10-12
tag: Guide
cover: fields
image: how-to-store-garlic.jpg
imageAlt: "Braided garlic bulbs hanging at a market stall"
imageCredit: "Jane Doe"
imageCreditUrl: "https://unsplash.com/photos/abc123"
imageLicense: "Unsplash License"
---
```

`publishedAt` is today's date in UTC. `cover` stays as the fallback art
(`fields`, `payment`, `seasons` or `market`). Frontmatter is one `key: value`
per line; a value may be wrapped in double quotes and must not contain a
double quote itself.

The body:

- 900 to 1,400 words. Open by answering the question in the first two
  sentences, then go deeper. No H1 (the title is the H1), at least three `##`
  sections, headings in Title Case like the existing posts.
- Write like the three original posts in the folder: plain, specific, second
  person, a little dry. Read one of them first.
- No en dashes or em dashes anywhere, in the body or the frontmatter. Use
  commas, colons, parentheses or a plain hyphen for ranges ("8am-1pm").
- No filler openers, no "in today's world", no "whether you're a ... or a
  ...", no closing paragraph that restates the post.
- Every factual claim about food safety, storage times, benefit programs or
  regulations comes from a primary source you actually opened during this run
  (USDA, FDA, a state agency, a university extension service) and links to
  it. If you cannot find a source, leave the claim out.
- Numbers about this site's markets come from the data, not from memory:
  compute them from `public/data/farmers_markets.json` and
  `public/data/geo_index.json` with a short script and quote what it prints.
- At least three internal links, written as root-relative paths. Useful
  targets: `/markets`, the topic pages (`/farmers-markets/snap-ebt`,
  `/farmers-markets/hours`, `/farmers-markets/saturday`,
  `/farmers-markets/online`), state pages (`/california`), city pages
  (`/new-york/brooklyn`) and other posts (`/blog/<slug>`). State and city
  slugs must exist in `geo_index.json`; the test checks every link.
- No inline images in the body. The cover photo is the post's picture.

## 3. Find a real photo

Every post needs a real photograph. Never use an AI-generated image, an
illustration or a rendering, and skip any photo its source labels as
AI-generated.

A photo may be used only when the page it is published on states a licence
that allows commercial reuse and cropping. In practice:

| Source | Licence to record |
| --- | --- |
| unsplash.com | Unsplash License |
| pexels.com | Pexels License |
| commons.wikimedia.org | the file's own licence: CC0, CC BY, CC BY-SA or public domain |
| flickr.com | only CC0, CC BY, CC BY-SA, or "United States Government Work" (USDA's account is a good one) |
| any other site | only if that page itself states one of the licences above |

Not usable, however good the picture is: anything found through an image
search with no licence on its page, news sites, stock agencies (Getty,
Shutterstock, Adobe Stock, iStock, Alamy), a market's or farm's own website,
Instagram, Facebook, Pinterest, and any licence with NC (non-commercial) or ND
(no derivatives, which rules out cropping).

Choosing:

- The photo shows the thing the post is about: garlic for a garlic post, a
  market stall for a market post. Real produce at a market or on a farm beats
  a studio shot.
- Landscape, at least 1,200px wide, no watermark, no text overlay.
- Avoid photos where an identifiable person's face is the subject.
- Do not use a photo of a specific named market to illustrate a general post
  unless the alt text says which market it is.
- Check `public/blog/` and the other posts' `imageCreditUrl` values first;
  never reuse a photo.

Then fetch and crop it:

```
npm run blog:image -- <slug> <direct https URL of the image file>
```

That writes `public/blog/<slug>.jpg` at 1600x840. Open the result and look at
it before going on: if the crop cut off the subject or the photo is not what
its page said it was, pick another one.

Record in the frontmatter the photographer's name as the source shows it
(`imageCredit`), the page the photo is published on, not the image file
(`imageCreditUrl`), and the licence (`imageLicense`). Write `imageAlt` as a
plain description of what is in the picture.

If no usable photo can be found after a real search across at least three
sources, do not publish the post without one and do not substitute something
loosely related. Leave the topic as `"todo"`, add a `note` saying which
sources were tried, and move to the next topic.

### Backfill

If any existing post has no `image` yet, add a photo to one such post in the
same run, under the same rules, and set that post's `updatedAt` only if its
text also changed (a photo alone is not a revision).

## 4. Check and publish

1. In `docs/blog-backlog.json`, set the topic's `status` to `"published"` and
   add `slug` and `publishedAt`.
2. Run `npm run test:blog`, `npm run test:markdown` and `npm run lint`. All
   three must pass. Fix what they report; do not weaken a check to get a post
   through.
3. Commit only the post, its photo and the backlog, with a message like
   `Blog: how to store garlic`.
4. `git pull --rebase origin main`, then `git push origin main`.

If the checks cannot be made to pass, or the push is rejected for a reason a
rebase does not fix, stop without pushing and say what went wrong in the
run's final message. A missed day is fine; a broken build on `main` is not.
