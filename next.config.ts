import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";

/**
 * Deterministic build id, derived from the application source (not the data).
 *
 * Next's default build id is random, which makes every page's HTML and RSC
 * payload differ between two builds of identical code — so a deploy re-uploads
 * all ~14k prerendered pages (~2.5 GB) even when nothing changed. Deriving the
 * id from the app source keeps unchanged pages byte-identical across builds,
 * letting Vercel's upload dedup skip them. Data-only refreshes then upload
 * only the pages whose content actually changed.
 *
 * The dataset (`public/data`) is deliberately excluded: a data refresh must
 * NOT rotate the id (that would dirty every page), and it does not need to —
 * the id's job is cache-busting client JS, which only changes with source.
 */
function hashAppSource(): string {
  const hash = createHash("sha256");
  const roots = ["src", "package.json", "bun.lock", "next.config.ts", "tsconfig.json"];

  const walk = (path: string) => {
    const stats = statSync(path, { throwIfNoEntry: false });
    if (!stats) return;
    if (stats.isDirectory()) {
      for (const entry of readdirSync(path).sort()) walk(join(path, entry));
      return;
    }
    hash.update(path);
    hash.update(readFileSync(path));
  };

  for (const root of roots) walk(root);
  return hash.digest("hex").slice(0, 21);
}

const nextConfig: NextConfig = {
  generateBuildId: async () => hashAppSource(),
  experimental: {
    // Next defaults to cores-1 workers, which leaves one of the Vercel
    // builder's 4 cores idle through the ~100s static-generation phase while
    // the coordinator process sits at ~3% CPU (measured via --cpu-prof).
    // Locally the default is kept: dev machines have cores to spare.
    ...(process.env.VERCEL ? { cpus: Math.max(1, cpus().length) } : {}),
  },
};

export default nextConfig;
