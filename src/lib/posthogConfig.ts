/**
 * PostHog settings shared by the browser client, the server client and
 * `next.config.ts` (which is why this file imports nothing).
 *
 * Both variables are optional. Without a project token PostHog is simply off:
 * nothing initializes, nothing is captured, and builds and local runs behave
 * as before. `NEXT_PUBLIC_POSTHOG_HOST` picks the PostHog Cloud region and
 * defaults to US.
 */
export const POSTHOG_TOKEN_VAR = 'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN';

export const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() || undefined;

export const POSTHOG_HOST = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com'
).replace(/\/+$/, '');

/** `https://eu.i.posthog.com` -> `eu`. Anything unrecognized is treated as US. */
const region = /^https:\/\/eu\./.test(POSTHOG_HOST) ? 'eu' : 'us';

/** Static assets (the lazy-loaded replay, surveys and toolbar bundles). */
export const POSTHOG_ASSETS_HOST = `https://${region}-assets.i.posthog.com`;

/** The PostHog app itself, used for toolbar and "view in PostHog" links. */
export const POSTHOG_UI_HOST = `https://${region}.posthog.com`;

/**
 * First-party path the browser talks to. `next.config.ts` rewrites it to
 * PostHog, so ingestion is not lost to blockers that match posthog.com.
 */
export const POSTHOG_PROXY_PATH = '/ingest';

/** Request headers that tie a server-side event to the browser's session. */
export const POSTHOG_DISTINCT_ID_HEADER = 'X-POSTHOG-DISTINCT-ID';
export const POSTHOG_SESSION_ID_HEADER = 'X-POSTHOG-SESSION-ID';

/** Shown in development only; production without a token is a silent no-op. */
export const POSTHOG_MISSING_TOKEN_MESSAGE = `${POSTHOG_TOKEN_VAR} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${POSTHOG_TOKEN_VAR} is configured`;
