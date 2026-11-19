// Shared by the photo alt scripts: a downsized local copy of each photo, and a
// headless Claude Code call that reads the images and replies with JSON.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export async function cachedImage(row, cacheDir) {
  const file = path.join(cacheDir, `${row.id}.jpg`);
  try {
    await fs.access(file);
    return file;
  } catch {}
  const response = await fetch(row.blob_url);
  if (!response.ok) throw new Error(`${response.status} fetching ${row.blob_url}`);
  const input = Buffer.from(await response.arrayBuffer());
  await sharp(input).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(file);
  return file;
}

export function runClaude(prompt, cwd, model) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', [
      '-p', prompt,
      '--model', model,
      '--tools', 'Read',
      '--allowedTools', 'Read',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--output-format', 'json',
    ], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
      try {
        const envelope = JSON.parse(stdout);
        if (envelope.is_error) return reject(new Error(`claude error: ${String(envelope.result).slice(0, 500)}`));
        const text = String(envelope.result ?? '');
        const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
        resolve({ drafts: JSON.parse(json), cost: envelope.total_cost_usd ?? 0 });
      } catch (error) {
        reject(new Error(`unparseable reply: ${error.message}: ${stdout.slice(0, 500)}`));
      }
    });
  });
}
