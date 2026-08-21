#!/usr/bin/env node

/**
 * Submit changed URLs to IndexNow.
 *
 *   npm run indexnow:ping -- https://www.farmermarkets.app/markets/example
 *   cat urls.txt | npm run indexnow:ping
 *   npm run indexnow:ping -- --dry-run https://www.farmermarkets.app/markets/example
 *
 * URLs come from the arguments, from stdin (one per line), or both. Relative
 * paths are resolved against the canonical origin, duplicates and off-host URLs
 * are dropped, and the rest are POSTed in batches of at most 10,000.
 *
 * `--dry-run` prints the exact JSON payloads and sends nothing. The key, the
 * endpoint, and the rotation procedure live in `scripts/lib/indexnow.mjs`.
 */

import { pathToFileURL } from 'node:url';
import { SITE_URL, indexNowKey, keyLocation, submitUrls } from './lib/indexnow.mjs';

const USAGE = `Usage: node scripts/indexnow-ping.mjs [--dry-run] [--force] [url ...]

  --dry-run   print the JSON payload(s) without sending anything
  --force     submit even when INDEXNOW_DISABLE is set
  --help      show this message

URLs may also be piped on stdin, one per line.`;

export function parseArguments(argv) {
  const options = { dryRun: false, force: false, help: false, urls: [] };
  for (const argument of argv) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--force') options.force = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('-')) throw new Error(`Unknown argument: ${argument}`);
    else options.urls.push(argument);
  }
  return options;
}

/** Lines from stdin, when it is piped. Returns [] for an interactive TTY. */
export async function readStdinUrls(stream = process.stdin) {
  if (stream.isTTY) return [];
  let text = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) text += chunk;
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return;
  }

  const urls = [...options.urls, ...(await readStdinUrls())];
  if (urls.length === 0) {
    console.error('No URLs given.\n');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  console.log(`indexnow: host ${new URL(SITE_URL).host}, key ${indexNowKey()}, keyLocation ${keyLocation()}`);
  const result = await submitUrls(urls, { dryRun: options.dryRun, force: options.force });

  if (result.results.some((entry) => !entry.ok)) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
