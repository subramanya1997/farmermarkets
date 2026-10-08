import 'server-only';
import { PostHog } from 'posthog-node';
import {
  POSTHOG_DISTINCT_ID_HEADER,
  POSTHOG_HOST,
  POSTHOG_MISSING_TOKEN_MESSAGE,
  POSTHOG_SESSION_ID_HEADER,
  POSTHOG_TOKEN,
} from '@/lib/posthogConfig';

let client: PostHog | null = null;
let warned = false;

/**
 * Server-side PostHog client, or `null` when no project token is configured.
 *
 * Function instances are short-lived, so events are sent as they are captured
 * rather than batched; callers still `await client.flush()` before returning.
 */
export function getPostHogServer(): PostHog | null {
  if (!POSTHOG_TOKEN) {
    if (process.env.NODE_ENV === 'development' && !warned) {
      warned = true;
      console.error(POSTHOG_MISSING_TOKEN_MESSAGE);
    }
    return null;
  }
  client ??= new PostHog(POSTHOG_TOKEN, {
    host: POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return client;
}

/** The browser's PostHog identity, when the client sent it with the request. */
export function posthogRequestIdentity(headers: Headers) {
  return {
    distinctId: headers.get(POSTHOG_DISTINCT_ID_HEADER)?.slice(0, 200) || undefined,
    sessionId: headers.get(POSTHOG_SESSION_ID_HEADER)?.slice(0, 200) || undefined,
  };
}
