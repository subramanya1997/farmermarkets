import assert from 'node:assert/strict';
import test from 'node:test';

const { buildMarketPopupHtml, buildSingleMarketPopupHtml } = await import('./leafletPopupHtml.ts');

test('market popup escapes display text and keeps detail link routable', () => {
  const html = buildMarketPopupHtml({
    name: 'Bob <Fresh> "Market" & Co',
    city: 'Bend <script>',
    state: 'OR "West"',
    slug: 'bob "fresh" & co',
  });

  assert.match(html, /Bob &lt;Fresh&gt; &quot;Market&quot; &amp; Co/);
  assert.match(html, /Bend &lt;script&gt;, OR &quot;West&quot;/);
  assert.match(html, /href="\/markets\/bob%20%22fresh%22%20%26%20co"/);
  assert.doesNotMatch(html, /<script>/);
});

test('single-market popup escapes angle brackets and quotes as text', () => {
  const html = buildSingleMarketPopupHtml({
    name: 'Alice <Farm> "Stand"',
    city: "Coeur d'Alene",
    state: 'ID',
  });

  assert.match(html, /Alice &lt;Farm&gt; &quot;Stand&quot;/);
  assert.match(html, /Coeur d&#39;Alene, ID/);
  assert.doesNotMatch(html, /<Farm>/);
});
