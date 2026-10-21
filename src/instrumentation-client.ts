import posthog from 'posthog-js';
import {
  POSTHOG_MISSING_TOKEN_MESSAGE,
  POSTHOG_PROXY_PATH,
  POSTHOG_TOKEN,
  POSTHOG_UI_HOST,
} from '@/lib/posthogConfig';
import { currentPageProperties } from '@/lib/pageContext';

// The one place the browser PostHog client is initialized. Do not add a
// PostHogProvider or a second `posthog.init` anywhere else.
if (POSTHOG_TOKEN) {
  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_PROXY_PATH,
    ui_host: POSTHOG_UI_HOST,
    // Dated defaults: history-based pageviews and pageleaves for App Router
    // navigations, plus the current autocapture and replay behavior.
    defaults: '2026-05-30',
    // The site has no accounts, so every visitor stays anonymous.
    person_profiles: 'identified_only',
    // Unhandled errors and promise rejections go to Error Tracking.
    capture_exceptions: true,
    // Session replay is switched on in the PostHog project settings. Inputs
    // stay masked so contact details typed into forms are never recorded.
    session_recording: { maskAllInputs: true },
    // Every event, page views included, says what kind of page it came from
    // (page_type, plus page_state / page_city / page_market where they apply).
    // An event's own properties win over these. Replay chunks are skipped:
    // they already belong to a session whose page views carry the context.
    before_send: (event) => {
      if (event && event.event !== '$snapshot') event.properties = { ...currentPageProperties(window.location.pathname), ...event.properties };
      return event;
    },
  });
} else if (process.env.NODE_ENV === 'development') {
  console.error(POSTHOG_MISSING_TOKEN_MESSAGE);
}
