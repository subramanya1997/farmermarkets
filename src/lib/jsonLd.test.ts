import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonLdHtml } from './jsonLd.ts';

test('text that tries to close the script tag is escaped and still parses to the same value', () => {
  const value = { name: 'Bread</script><script>alert(1)</script>', note: 'a & b', lines: `x${String.fromCharCode(0x2028)}y` };
  const html = jsonLdHtml(value);
  assert.equal(html.includes('<'), false);
  assert.equal(html.includes('>'), false);
  assert.equal(html.includes('&'), false);
  assert.equal(html.includes(String.fromCharCode(0x2028)), false);
  assert.deepEqual(JSON.parse(html), value);
});
