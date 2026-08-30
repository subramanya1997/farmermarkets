/**
 * A deliberately tiny markdown renderer for the blog.
 *
 * Posts are markdown files under `src/content/blog/` so the copy is plain
 * text a person or an LLM can read straight from the repo. The site has no
 * markdown dependency, and the authoring format is a subset we control, so
 * this renders exactly that subset and nothing more:
 *
 *   - `## ` and `### ` headings
 *   - paragraphs (blank-line separated)
 *   - unordered lists (`- `) and ordered lists (`1. `), no nesting
 *   - inline links `[text](href)`, bold `**text**`, italic `*text*`
 *
 * Everything is HTML-escaped before inline markup is applied, so post content
 * can never inject markup. Anything outside the subset renders as literal
 * text, which a test will catch long before a reader does.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Inline markup on already-escaped text: links, then bold, then italic.
 * Link hrefs allow only site-relative paths and http(s) URLs.
 */
function renderInline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, href: string) => {
      if (!/^(\/|https?:\/\/)/.test(href)) return match;
      const external = /^https?:\/\//.test(href);
      const rel = external ? ' rel="noopener noreferrer" target="_blank"' : '';
      return `<a href="${href}"${rel}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

/** Anchor id for a heading: lowercase, alphanumerics, hyphens. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-');
}

export interface MarkdownHeading {
  /** 2 for `##`, 3 for `###`. */
  depth: 2 | 3;
  text: string;
  /** Matches the id the renderer stamps on the heading element. */
  id: string;
}

/** The `##`/`###` headings of a markdown body, for a table of contents. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      headings.push({ depth: 3, text: trimmed.slice(4), id: headingId(trimmed.slice(4)) });
    } else if (trimmed.startsWith('## ')) {
      headings.push({ depth: 2, text: trimmed.slice(3), id: headingId(trimmed.slice(3)) });
    }
  }
  return headings;
}

/** One markdown block: a heading, a list, or a paragraph. */
function renderBlock(block: string): string {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  if (lines.length === 1 && lines[0].startsWith('### ')) {
    const text = lines[0].slice(4);
    return `<h3 id="${headingId(text)}">${renderInline(escapeHtml(text))}</h3>`;
  }
  if (lines.length === 1 && lines[0].startsWith('## ')) {
    const text = lines[0].slice(3);
    return `<h2 id="${headingId(text)}">${renderInline(escapeHtml(text))}</h2>`;
  }
  if (lines.every((line) => line.startsWith('- '))) {
    const items = lines.map((line) => `<li>${renderInline(escapeHtml(line.slice(2)))}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }
  if (lines.every((line) => /^\d+\. /.test(line))) {
    const items = lines.map(
      (line) => `<li>${renderInline(escapeHtml(line.replace(/^\d+\. /, '')))}</li>`
    );
    return `<ol>${items.join('')}</ol>`;
  }
  return `<p>${renderInline(escapeHtml(lines.join(' ')))}</p>`;
}

/** Markdown body → HTML string, for the post page's prose wrapper. */
export function renderMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => renderBlock(block))
    .filter(Boolean)
    .join('\n');
}

/** Word count of the raw markdown, for an honest reading-time estimate. */
export function countWords(markdown: string): number {
  const withoutSyntax = markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*-]/g, ' ');
  return withoutSyntax.split(/\s+/).filter(Boolean).length;
}

export interface ParsedMarkdownDocument {
  /** Frontmatter key/value pairs; values are unquoted strings. */
  frontmatter: Record<string, string>;
  /** Everything after the frontmatter block. */
  body: string;
}

/**
 * Parse a `---` frontmatter block of simple `key: value` lines. Throws on a
 * malformed document rather than guessing: posts are repo files, so a bad one
 * should fail the build, not ship half-parsed.
 */
export function parseFrontmatter(document: string): ParsedMarkdownDocument {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(document.replace(/\r\n/g, '\n'));
  if (!match) {
    throw new Error('Markdown document has no frontmatter block');
  }

  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const separator = line.indexOf(':');
    if (separator === -1) {
      throw new Error(`Malformed frontmatter line: ${line}`);
    }
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1');
    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2].trim() };
}
