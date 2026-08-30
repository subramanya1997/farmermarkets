import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { countWords, extractHeadings, parseFrontmatter, renderMarkdown } from './markdown.ts';

test('headings, paragraphs and lists', () => {
  const html = renderMarkdown(
    '## Hours\n\nMost markets run weekly.\n\n- One\n- Two\n\n1. First\n2. Second\n\n### Winter'
  );
  assert.equal(
    html,
    '<h2 id="hours">Hours</h2>\n<p>Most markets run weekly.</p>\n<ul><li>One</li><li>Two</li></ul>\n<ol><li>First</li><li>Second</li></ol>\n<h3 id="winter">Winter</h3>'
  );
});

test('heading ids and extraction agree', () => {
  const markdown = "## What's Open? Days & Hours\n\ntext\n\n### Winter, Indoors";
  assert.deepEqual(extractHeadings(markdown), [
    { depth: 2, text: "What's Open? Days & Hours", id: 'whats-open-days-hours' },
    { depth: 3, text: 'Winter, Indoors', id: 'winter-indoors' },
  ]);
  const html = renderMarkdown(markdown);
  assert.ok(html.includes('<h2 id="whats-open-days-hours">'));
  assert.ok(html.includes('<h3 id="winter-indoors">'));
});

test('multi-line paragraphs join with a space', () => {
  assert.equal(renderMarkdown('One line\nand another.'), '<p>One line and another.</p>');
});

test('inline links, bold, italic', () => {
  assert.equal(
    renderMarkdown('See [the directory](/markets) for **fresh** *food*.'),
    '<p>See <a href="/markets">the directory</a> for <strong>fresh</strong> <em>food</em>.</p>'
  );
});

test('external links open in a new tab, other schemes stay literal', () => {
  assert.equal(
    renderMarkdown('[USDA](https://www.usda.gov)'),
    '<p><a href="https://www.usda.gov" rel="noopener noreferrer" target="_blank">USDA</a></p>'
  );
  const unsafe = renderMarkdown('[x](javascript:alert(1))');
  assert.ok(!unsafe.includes('<a'), `unsafe scheme must not link: ${unsafe}`);
});

test('HTML in content is escaped, never rendered', () => {
  const html = renderMarkdown('Tokens <script>alert(1)</script> & "quotes"');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(!html.includes('<script>'));
});

test('frontmatter parses simple key: value lines', () => {
  const { frontmatter, body } = parseFrontmatter(
    '---\ntitle: "A: Title"\npublishedAt: 2026-08-29\n---\n\nBody here.'
  );
  assert.equal(frontmatter.title, 'A: Title');
  assert.equal(frontmatter.publishedAt, '2026-08-29');
  assert.equal(body, 'Body here.');
});

test('missing frontmatter throws', () => {
  assert.throws(() => parseFrontmatter('No frontmatter.'));
});

test('word count strips syntax', () => {
  assert.equal(countWords('## Two words\n\n- **bold** [link](/x)'), 4);
});
