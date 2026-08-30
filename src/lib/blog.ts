/**
 * The blog: markdown files on disk, one per post.
 *
 * Posts live in `src/content/blog/<slug>.md` with a `---` frontmatter block
 * (title, description, publishedAt, optionally updatedAt). Markdown, not
 * TSX, on purpose: the copy stays plain text a person, a diff, or an LLM can
 * read straight from the repo, and `/llms.txt` links every post. Rendering
 * happens at build/ISR time through the in-repo renderer in `markdown.ts`.
 *
 * A malformed post throws, so a bad file fails the build instead of shipping
 * a half-parsed page.
 */

import 'server-only';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { countWords, parseFrontmatter, renderMarkdown } from './markdown';

export interface BlogPost {
  /** URL segment under `/blog/`, from the filename. */
  slug: string;
  title: string;
  /** One or two sentences for the index card and meta description. */
  description: string;
  /** ISO date (YYYY-MM-DD). The truthful `lastmod` the sitemap publishes. */
  publishedAt: string;
  /** ISO date (YYYY-MM-DD); set only when a post is meaningfully revised. */
  updatedAt?: string;
  /** Rendered body HTML for the post page's prose wrapper. */
  html: string;
  /** Whole minutes at a reading pace of roughly 220 words per minute. */
  readingMinutes: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'blog');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function loadPost(filename: string): BlogPost {
  const slug = filename.replace(/\.md$/, '');
  const raw = readFileSync(path.join(CONTENT_DIR, filename), 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const { title, description, publishedAt, updatedAt } = frontmatter;
  if (!title || !description) {
    throw new Error(`Blog post ${filename} is missing a title or description`);
  }
  if (!publishedAt || !ISO_DATE.test(publishedAt)) {
    throw new Error(`Blog post ${filename} needs a publishedAt date (YYYY-MM-DD)`);
  }
  if (updatedAt && !ISO_DATE.test(updatedAt)) {
    throw new Error(`Blog post ${filename} has a malformed updatedAt date`);
  }

  return {
    slug,
    title,
    description,
    publishedAt,
    ...(updatedAt ? { updatedAt } : {}),
    html: renderMarkdown(body),
    readingMinutes: Math.max(1, Math.round(countWords(body) / 220)),
  };
}

let postsCache: BlogPost[] | null = null;

/** Every post, newest first. Read from disk once per server process. */
export function getAllPosts(): BlogPost[] {
  if (!postsCache) {
    postsCache = readdirSync(CONTENT_DIR)
      .filter((file) => file.endsWith('.md'))
      .map(loadPost)
      .sort(
        (left, right) =>
          right.publishedAt.localeCompare(left.publishedAt) || left.slug.localeCompare(right.slug)
      );
  }
  return postsCache;
}

/** One post by slug, or undefined (→ 404). */
export function getPost(slug: string): BlogPost | undefined {
  return getAllPosts().find((post) => post.slug === slug);
}

/** Canonical path for a post. */
export function blogPath(slug: string): string {
  return `/blog/${slug}`;
}
