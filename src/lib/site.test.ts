import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GITHUB_REPO_URL, organizationSameAs } from './site.ts';

test('an unset variable still names the public repository', () => {
  assert.deepEqual(organizationSameAs(undefined), [GITHUB_REPO_URL]);
});

test('an empty or whitespace variable adds nothing', () => {
  assert.deepEqual(organizationSameAs(''), [GITHUB_REPO_URL]);
  assert.deepEqual(organizationSameAs('   ,  , '), [GITHUB_REPO_URL]);
});

test('comma-separated URLs are trimmed and kept in order', () => {
  assert.deepEqual(
    organizationSameAs(' https://www.wikidata.org/wiki/Q123 , https://x.com/farmermarkets '),
    [GITHUB_REPO_URL, 'https://www.wikidata.org/wiki/Q123', 'https://x.com/farmermarkets']
  );
});

test('values that are not absolute http(s) URLs are dropped', () => {
  // A bare Q-ID, a handle and a scheme-less domain are all things an owner
  // might paste in; none of them is a `sameAs` value.
  assert.deepEqual(
    organizationSameAs('Q123,@farmermarkets,wikidata.org/wiki/Q123,ftp://example.com/x'),
    [GITHUB_REPO_URL]
  );
});

test('a repeated entry does not appear twice', () => {
  assert.deepEqual(
    organizationSameAs(`${GITHUB_REPO_URL},https://example.com/a,https://example.com/a`),
    [GITHUB_REPO_URL, 'https://example.com/a']
  );
});
