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
import {
  countWords,
  extractHeadings,
  parseFrontmatter,
  renderMarkdown,
  type MarkdownHeading,
} from './markdown';
import { BLOG_COVER_THEMES, type BlogCoverTheme } from '@/components/BlogCover';

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
  /** Byline category chip, from frontmatter `tag`; defaults to "Guide". */
  tag: string;
  /** Cover art scene, from frontmatter `cover`; defaults to "fields". */
  cover: BlogCoverTheme;
  /** Rendered body HTML for the post page's prose wrapper. */
  html: string;
  /** The body's `##`/`###` headings, for the contents sidebar. */
  headings: MarkdownHeading[];
  /** Whole minutes at a reading pace of roughly 220 words per minute. */
  readingMinutes: number;
}

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'blog');
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function loadPost(filename: string): BlogPost {
  const slug = filename.replace(/\.md$/, '');
  const raw = readFileSync(path.join(CONTENT_DIR, filename), 'utf8');
  const { frontmatter, body } = parseFrontmatter(raw);

  const { title, description, publishedAt, updatedAt, tag, cover } = frontmatter;
  if (!title || !description) {
    throw new Error(`Blog post ${filename} is missing a title or description`);
  }
  if (!publishedAt || !ISO_DATE.test(publishedAt)) {
    throw new Error(`Blog post ${filename} needs a publishedAt date (YYYY-MM-DD)`);
  }
  if (updatedAt && !ISO_DATE.test(updatedAt)) {
    throw new Error(`Blog post ${filename} has a malformed updatedAt date`);
  }
  if (cover && !BLOG_COVER_THEMES.includes(cover as BlogCoverTheme)) {
    throw new Error(
      `Blog post ${filename} has unknown cover "${cover}" (valid: ${BLOG_COVER_THEMES.join(', ')})`
    );
  }

  return {
    slug,
    title,
    description,
    publishedAt,
    ...(updatedAt ? { updatedAt } : {}),
    tag: tag || 'Guide',
    cover: (cover as BlogCoverTheme) || 'fields',
    html: renderMarkdown(body),
    headings: extractHeadings(body),
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
