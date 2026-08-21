import { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/**
 * `/robots.txt`.
 *
 * **The wildcard allow is a decision, not an oversight.** Every crawler —
 * including GPTBot, ClaudeBot, PerplexityBot, CCBot and Google-Extended — is
 * allowed the whole directory, and no `User-agent` block singles any of them
 * out. Three reasons, in the order they matter:
 *
 *  1. **Retrieval bots gate AI-answer inclusion.** OAI-SearchBot,
 *     Claude-SearchBot and PerplexityBot are the fetchers that populate
 *     ChatGPT, Claude and Perplexity answers, exactly as Googlebot and Bingbot
 *     gate the SERP. Blocking one removes this directory from the answers that
 *     product gives — the modern equivalent of blocking Googlebot.
 *  2. **Blocking the training crawlers buys nothing here.** The separate
 *     training agents (GPTBot, ClaudeBot, CCBot) are not what retrieval reads,
 *     so disallowing them does not keep the site out of AI answers; it only
 *     removes it from the corpora those answers cite. The Rutgers/Wharton study
 *     (December 2025) measured publishers who blocked them: −23.1% traffic,
 *     with no measurable drop in how often their content was cited anyway.
 *  3. **Google-Extended is not an AI Overviews switch.** It governs Gemini
 *     model training only; AI Overviews and AI Mode are served from the regular
 *     Google Search index, so disallowing it costs Gemini grounding without
 *     removing the site from a single AI Overview.
 *
 * Our content is a public directory of public-dataset facts whose whole value
 * is being found. There is nothing here to withhold.
 *
 * `/api/*` stays disallowed: those routes return the same market records the
 * HTML pages render, so crawling them spends budget re-reading the site in a
 * format no search result can use.
 *
 * (A `Disallow: /private/*` rule used to sit here. Nothing has ever been served
 * under `/private` — no route in `src/app`, no file in `public` — so the rule
 * only advertised a path that does not exist. Removed rather than backfilled
 * with a guard: there is nothing to guard.)
 *
 * Revisit if the directory ever hosts non-public data, or if a major engine
 * changes what its retrieval agent does.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/*'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
