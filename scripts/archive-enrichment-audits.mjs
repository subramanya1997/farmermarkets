#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const archiveDirectory = path.join(root, 'data/enrichment/archive');
const manifestPath = path.join(archiveDirectory, 'manifest.json');
const definitions = [
  {
    id: 'full-market-audit',
    source: 'data/enrichment/audit',
    archive: 'audit-2026-08-21.tar.gz',
  },
  {
    id: 'website-audit-v1',
    source: 'data/enrichment/site-audit',
    archive: 'site-audit-v1-2026-08-21.tar.gz',
  },
];

function fail(message) {
  throw new Error(message);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function sha256(filePath) {
  return createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

async function sourceFileCount(directory) {
  let count = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) count += await sourceFileCount(entryPath);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

async function archiveEntries(filePath) {
  const { stdout } = await execFile('tar', ['-tzf', filePath], { maxBuffer: 16 * 1024 * 1024 });
  return stdout.split(/\r?\n/).filter(Boolean);
}

function archivedFileCount(entries) {
  return entries.filter((entry) => !entry.endsWith('/')).length;
}

export async function checkArchives() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.archives)) {
    fail('archive manifest has an unsupported shape');
  }
  for (const archive of manifest.archives) {
    const filePath = path.join(archiveDirectory, archive.file);
    const stats = await fs.stat(filePath);
    if (stats.size !== archive.bytes) fail(`${archive.file} size does not match its manifest`);
    if (await sha256(filePath) !== archive.sha256) fail(`${archive.file} checksum does not match`);
    const entries = await archiveEntries(filePath);
    if (archivedFileCount(entries) !== archive.file_count) {
      fail(`${archive.file} entry count does not match its manifest`);
    }
    if (entries.some((entry) => !entry.startsWith(`${archive.source}/`))) {
      fail(`${archive.file} contains an entry outside ${archive.source}`);
    }
  }
  console.log(`validated ${manifest.archives.length} enrichment archives containing ${manifest.archives.reduce((sum, item) => sum + item.file_count, 0)} files`);
  return manifest;
}

export async function createArchives({ replace = false } = {}) {
  await fs.mkdir(archiveDirectory, { recursive: true });
  if (await exists(manifestPath) && !replace) {
    fail('archive manifest already exists; use the refresh command to replace verified archives');
  }
  const staged = [];
  try {
    for (const definition of definitions) {
      const sourcePath = path.join(root, definition.source);
      if (!await exists(sourcePath)) fail(`${definition.source} is missing`);
      const finalPath = path.join(archiveDirectory, definition.archive);
      if (await exists(finalPath) && !replace) fail(`${definition.archive} already exists`);
      const temporaryPath = `${finalPath}.tmp-${process.pid}`;
      // COPYFILE_DISABLE keeps macOS bsdtar from embedding hidden AppleDouble
      // (._*) entries, which GNU tar on CI lists as extra files.
      await execFile('tar', ['-czf', temporaryPath, '-C', root, definition.source], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      });
      const entries = await archiveEntries(temporaryPath);
      const expectedCount = await sourceFileCount(sourcePath);
      if (archivedFileCount(entries) !== expectedCount) {
        fail(`${definition.archive} captured ${archivedFileCount(entries)}/${expectedCount} files`);
      }
      staged.push({ definition, temporaryPath, finalPath, expectedCount });
    }

    for (const item of staged) await fs.rename(item.temporaryPath, item.finalPath);
    const archives = [];
    for (const item of staged) {
      const stats = await fs.stat(item.finalPath);
      archives.push({
        id: item.definition.id,
        file: item.definition.archive,
        source: item.definition.source,
        bytes: stats.size,
        sha256: await sha256(item.finalPath),
        file_count: item.expectedCount,
      });
    }
    const manifest = {
      schema_version: 1,
      created_at: new Date().toISOString(),
      format: 'tar+gzip',
      archives,
    };
    const temporaryManifest = `${manifestPath}.tmp-${process.pid}`;
    await fs.writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    await fs.rename(temporaryManifest, manifestPath);
    await checkArchives();

    for (const definition of definitions) {
      await fs.rm(path.join(root, definition.source), { recursive: true });
    }
    console.log('removed the archived audit directories after successful verification');
  } catch (error) {
    await Promise.all(staged.map((item) => fs.rm(item.temporaryPath, { force: true })));
    throw error;
  }
}

export async function restoreArchives() {
  const manifest = await checkArchives();
  for (const archive of manifest.archives) {
    const destination = path.join(root, archive.source);
    if (await exists(destination)) fail(`${archive.source} already exists; refusing to overwrite it`);
  }
  for (const archive of manifest.archives) {
    await execFile('tar', ['-xzf', path.join(archiveDirectory, archive.file), '-C', root]);
    const restoredCount = await sourceFileCount(path.join(root, archive.source));
    if (restoredCount !== archive.file_count) {
      fail(`${archive.source} restored ${restoredCount}/${archive.file_count} files`);
    }
  }
  console.log(`restored ${manifest.archives.length} enrichment audit directories`);
}

const mode = process.argv[2] ?? '--check';
if (mode === '--create') await createArchives({ replace: process.argv.includes('--replace') });
else if (mode === '--check') await checkArchives();
else if (mode === '--restore') await restoreArchives();
else fail(`unknown mode: ${mode}`);
