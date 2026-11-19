#!/usr/bin/env node

/**
 * Fail loudly when the source data behind the directory has gone stale.
 *
 * The official refresh failed every run from September to November 2026 and
 * nothing noticed: the site kept serving the August snapshot and the manifest
 * still said "partial" from August. This check is what turns that into a red
 * workflow and an open issue. It reads only the committed manifests, needs no
 * install and no network, and runs in two places:
 *
 *  - at the end of `.github/workflows/update-government-markets.yml`, right
 *    after a refresh, where it catches a source that keeps failing;
 *  - weekly from `.github/workflows/data-freshness.yml`, which catches a
 *    refresh that stopped running at all and a USDA snapshot nobody refreshed.
 *
 * Thresholds (see docs/data-refresh.md for the reasoning and what to do):
 *
 *  - GOVERNMENT_MAX_AGE_DAYS: the official refresh runs on the 1st of each
 *    month, so a good snapshot is at most about 31 days old. 45 days means one
 *    missed run plus two weeks.
 *  - GOVERNMENT_MAX_PARTIAL_RUNS: one partial run is a warning (a feed can be
 *    down for a night). Two in a row means a source is broken, not flaky.
 *  - LEGACY_MAX_AGE_DAYS: the USDA snapshot is refreshed by hand before and
 *    during the market season. 180 days means the reminder arrives in time for
 *    the next pass, not after it.
 *
 * Usage:
 *   node scripts/check-data-freshness.mjs [--scope all|government|legacy]
 *     [--now 2026-12-01T00:00:00Z] [--report-file path]
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const GOVERNMENT_MAX_AGE_DAYS = 45;
export const GOVERNMENT_MAX_PARTIAL_RUNS = 2;
export const LEGACY_MAX_AGE_DAYS = 180;

const GOVERNMENT_MANIFEST = 'data/sources/government_markets.manifest.json';
const LEGACY_MANIFEST = 'data/sources/legacy_markets.manifest.json';
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function ageInDays(value, now) {
  const date = parseDate(value);
  return date ? Math.floor((now.getTime() - date.getTime()) / DAY_MS) : undefined;
}

function day(value) {
  return parseDate(value)?.toISOString().slice(0, 10) ?? 'never';
}

/** Problems with the official government snapshot, as readable sentences. */
export function governmentProblems(manifest, now, {
  maxAgeDays = GOVERNMENT_MAX_AGE_DAYS,
  maxPartialRuns = GOVERNMENT_MAX_PARTIAL_RUNS
} = {}) {
  if (!manifest) return [`${GOVERNMENT_MANIFEST} is missing.`];
  const problems = [];

  const runAge = ageInDays(manifest.generated_at, now);
  const runIsOld = runAge === undefined || runAge > maxAgeDays;
  if (runIsOld) {
    problems.push(
      `The official government refresh last completed on ${day(manifest.generated_at)}` +
        `${runAge === undefined ? '' : ` (${runAge} days ago)`}; the limit is ${maxAgeDays} days.`
    );
  }

  // Manifests written before the counter existed still say whether that run
  // was partial, which counts as one.
  const partialRuns = manifest.consecutive_partial_runs ?? (manifest.status === 'ok' ? 0 : 1);
  const failing = (manifest.sources ?? []).filter((source) => ['stale', 'failed'].includes(source.status));
  if (partialRuns >= maxPartialRuns) {
    problems.push(
      `${partialRuns} official refreshes in a row ended partial. Failing: ` +
        `${failing.map((source) => `${source.id} (${source.error ?? source.status})`).join(', ') || 'see the manifest'}.`
    );
  }

  // When the whole run is old every source is old too; one line says it.
  if (!runIsOld) {
    for (const source of manifest.sources ?? []) {
      const sourceAge = ageInDays(source.retrieved_at, now);
      if (sourceAge !== undefined && sourceAge <= maxAgeDays) continue;
      problems.push(
        `${source.id} was last retrieved on ${day(source.retrieved_at)}` +
          `${sourceAge === undefined ? '' : ` (${sourceAge} days ago)`}` +
          `${source.error ? `; last error: ${source.error}` : ''}.`
      );
    }
  }

  return problems;
}

/** Problems with the USDA legacy snapshot, as readable sentences. */
export function legacyProblems(manifest, now, { maxAgeDays = LEGACY_MAX_AGE_DAYS } = {}) {
  if (!manifest) {
    return [`${LEGACY_MANIFEST} is missing, so nobody knows when the USDA snapshot was last refreshed.`];
  }
  const age = ageInDays(manifest.retrieved_at, now);
  if (age !== undefined && age <= maxAgeDays) return [];
  return [
    `The USDA snapshot was last refreshed on ${day(manifest.retrieved_at)}` +
      `${age === undefined ? '' : ` (${age} days ago)`}; the limit is ${maxAgeDays} days. ` +
      'Run the USDA refresh in docs/data-refresh.md.'
  ];
}

export function checkDataFreshness({ governmentManifest, legacyManifest, now = new Date(), scope = 'all' }) {
  const problems = [];
  if (scope === 'all' || scope === 'government') problems.push(...governmentProblems(governmentManifest, now));
  if (scope === 'all' || scope === 'legacy') problems.push(...legacyProblems(legacyManifest, now));
  return problems;
}

/** The issue body a failed check posts. */
export function freshnessReport(problems, now) {
  return [
    `Data freshness check on ${now.toISOString().slice(0, 10)} found ${problems.length} problem${problems.length === 1 ? '' : 's'}:`,
    '',
    ...problems.map((problem) => `- ${problem}`),
    '',
    'What to do: docs/data-refresh.md.'
  ].join('\n');
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseArguments(argv) {
  const options = { scope: 'all', now: new Date(), reportFile: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--scope') options.scope = argv[++index];
    else if (argument === '--now') options.now = new Date(argv[++index]);
    else if (argument === '--report-file') options.reportFile = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['all', 'government', 'legacy'].includes(options.scope)) throw new Error(`Unknown scope: ${options.scope}`);
  if (Number.isNaN(options.now.getTime())) throw new Error('--now must be a date');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const root = process.cwd();
  const [governmentManifest, legacyManifest] = await Promise.all([
    readJsonIfPresent(path.join(root, GOVERNMENT_MANIFEST)),
    readJsonIfPresent(path.join(root, LEGACY_MANIFEST))
  ]);
  const problems = checkDataFreshness({ governmentManifest, legacyManifest, now: options.now, scope: options.scope });

  if (options.reportFile) {
    await fs.writeFile(path.resolve(root, options.reportFile), problems.length ? `${freshnessReport(problems, options.now)}\n` : '', 'utf8');
  }
  if (!problems.length) {
    console.log(`data is fresh (${options.scope})`);
    return;
  }
  for (const problem of problems) console.log(`::error::${problem}`);
  process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
