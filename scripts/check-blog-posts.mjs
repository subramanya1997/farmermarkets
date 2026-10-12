/**
 * Publishing gate for blog posts (`npm run test:blog`).
 *
 * Posts are written by a scheduled routine and go live without a human
 * reading them first, so everything a reviewer would have caught mechanically
 * is checked here instead: the frontmatter is complete, the copy follows the
 * house style, the photo is real, credited and on disk, and every internal
 * link points at a page that exists.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const postsDir = new URL('src/content/blog/', root);
const geoIndex = JSON.parse(readFileSync(new URL('public/data/geo_index.json', root), 'utf8'));
const backlog = JSON.parse(readFileSync(new URL('docs/blog-backlog.json', root), 'utf8'));

/** Posts from this date on must carry a real photo; older ones are being backfilled. */
const PHOTO_REQUIRED_FROM = '2026-10-12';

const STATIC_PATHS = new Set([
  '/',
  '/markets',
  '/blog',
  '/about',
  '/about-the-data',
  '/for-market-operators',
  '/farmers-markets/snap-ebt',
  '/farmers-markets/online',
  '/farmers-markets/hours',
  '/farmers-markets/saturday',
]);
const states = new Map(geoIndex.states.map((state) => [state.slug, state]));

function parse(file) {
  const raw = readFileSync(new URL(file, postsDir), 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
  assert.ok(match, `${file} has no frontmatter block`);
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const at = line.indexOf(':');
    frontmatter[line.slice(0, at).trim()] = line
      .slice(at + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
  }
  return { frontmatter, body: match[2] };
}

const files = readdirSync(postsDir).filter((file) => file.endsWith('.md'));
const slugs = new Set(files.map((file) => file.replace(/\.md$/, '')));

function linkExists(path) {
  const clean = path.split('#')[0].replace(/\/$/, '') || '/';
  if (STATIC_PATHS.has(clean)) return true;
  const segments = clean.split('/').filter(Boolean);
  if (segments[0] === 'blog') return segments.length === 2 && slugs.has(segments[1]);
  if (segments[0] === 'markets') return segments.length === 2; // checked by test:market-routes
  const state = states.get(segments[0]);
  if (!state) return false;
  if (segments.length === 1) return true;
  return segments.length === 2 && state.cities.some((city) => city.slug === segments[1]);
}

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const { frontmatter, body } = parse(file);

  test(`${slug}: frontmatter`, () => {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case');
    assert.ok(frontmatter.title, 'title is required');
    assert.ok(frontmatter.title.length <= 70, `title is ${frontmatter.title.length} chars, max 70`);
    const description = frontmatter.description ?? '';
    assert.ok(
      description.length >= 110 && description.length <= 165,
      `description is ${description.length} chars, want 110 to 165`
    );
    assert.match(frontmatter.publishedAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(
      frontmatter.publishedAt <= new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      'publishedAt is in the future'
    );
  });

  test(`${slug}: copy`, () => {
    const everything = `${Object.values(frontmatter).join('\n')}\n${body}`;
    assert.ok(!/[–—]/.test(everything), 'contains an en or em dash');
    const words = body.split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 700 && words <= 1800, `body is ${words} words, want 700 to 1800`);
    assert.ok(!/^# /m.test(body), 'body must not contain an H1; the title is the H1');
    assert.ok((body.match(/^## /gm) ?? []).length >= 3, 'needs at least three ## sections');
    assert.ok(!/!\[[^\]]*\]\(/.test(body), 'inline images are not supported; use the cover photo');
  });

  test(`${slug}: links`, () => {
    const internal = [...body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1]);
    assert.ok(internal.length >= 3, `has ${internal.length} internal links, want at least 3`);
    for (const path of internal) {
      assert.ok(linkExists(path), `links to ${path}, which is not a page on the site`);
    }
    assert.ok(
      !/farmermarkets\.app/.test(body),
      'link to site pages with root-relative paths, not the full domain'
    );
  });

  test(`${slug}: photo`, () => {
    if (!frontmatter.image) {
      assert.ok(
        frontmatter.publishedAt < PHOTO_REQUIRED_FROM,
        `posts from ${PHOTO_REQUIRED_FROM} on need a real cover photo`
      );
      return;
    }
    assert.equal(frontmatter.image, `${slug}.jpg`, 'image must be <slug>.jpg');
    const photo = new URL(`public/blog/${frontmatter.image}`, root);
    assert.ok(existsSync(photo), `public/blog/${frontmatter.image} is missing`);
    const kilobytes = statSync(photo).size / 1024;
    assert.ok(kilobytes >= 40 && kilobytes <= 600, `photo is ${Math.round(kilobytes)} KB, want 40 to 600`);
    assert.ok((frontmatter.imageAlt ?? '').length >= 20, 'imageAlt must describe the photo');
    assert.ok(frontmatter.imageCredit, 'imageCredit is required');
    assert.ok(frontmatter.imageLicense, 'imageLicense is required');
    assert.match(frontmatter.imageCreditUrl ?? '', /^https:\/\//, 'imageCreditUrl must be the source page');
    assert.ok(
      !/\.(jpe?g|png|webp)(\?|$)/i.test(frontmatter.imageCreditUrl),
      'imageCreditUrl must be the page the photo is published on, not the image file'
    );
  });
}

test('backlog: every published topic names a post that exists', () => {
  const seen = new Set();
  for (const topic of backlog.topics) {
    assert.ok(!seen.has(topic.keyword), `backlog lists "${topic.keyword}" twice`);
    seen.add(topic.keyword);
    if (topic.status === 'published') {
      assert.ok(slugs.has(topic.slug), `backlog marks "${topic.keyword}" published as ${topic.slug}, which is missing`);
    }
  }
});
