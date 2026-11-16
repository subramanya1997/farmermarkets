import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAutomatedUserAgent } from './automatedBrowser.ts';

test('self-declared headless browsers are recognized', () => {
  assert.equal(isAutomatedUserAgent('Lightpanda/1.0'), true);
  assert.equal(
    isAutomatedUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36',
    ),
    true,
  );
});

test('ordinary visitor browsers are not', () => {
  for (const ua of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:159.0) Gecko/20100101 Firefox/159.0',
    'Mozilla/5.0 (Linux; Android 9; KFMAWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/138.18.2 like Chrome/138.0 Safari/537.36',
  ]) {
    assert.equal(isAutomatedUserAgent(ua), false, ua);
  }
  assert.equal(isAutomatedUserAgent(''), false);
  assert.equal(isAutomatedUserAgent(undefined), false);
});
