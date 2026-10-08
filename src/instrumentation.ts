import type { Instrumentation } from 'next';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  POSTHOG_HOST,
  POSTHOG_MISSING_TOKEN_MESSAGE,
  POSTHOG_TOKEN,
} from '@/lib/posthogConfig';

const loggerProvider = POSTHOG_TOKEN
  ? new LoggerProvider({
      resource: resourceFromAttributes({ 'service.name': 'farmermarkets' }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${POSTHOG_HOST}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${POSTHOG_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }),
        }),
      ],
    })
  : undefined;

export function getPostHogLogLogger() {
  return loggerProvider?.getLogger('farmermarkets.posthog-export');
}

export function flushPostHogLogs() {
  return loggerProvider?.forceFlush() ?? Promise.resolve();
}

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!loggerProvider && process.env.NODE_ENV === 'development') {
    console.error(POSTHOG_MISSING_TOKEN_MESSAGE);
  }
}

/** The visitor's PostHog distinct id, read from the browser SDK's cookie. */
function distinctIdFromCookie(cookie: string | string[] | undefined): string | undefined {
  if (!cookie) return undefined;
  const cookieString = Array.isArray(cookie) ? cookie.join('; ') : cookie;
  const match = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);
  if (!match?.[1]) return undefined;
  try {
    const distinctId = JSON.parse(decodeURIComponent(match[1])).distinct_id;
    return typeof distinctId === 'string' ? distinctId : undefined;
  } catch {
    return undefined;
  }
}

// Server-side errors (rendering, route handlers, proxy) go to PostHog Error
// Tracking. Reporting must never turn one failure into two, hence the catch.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { getPostHogServer } = await import('@/lib/posthogServer');
    const posthog = getPostHogServer();
    if (!posthog) return;
    posthog.captureException(err, distinctIdFromCookie(request.headers.cookie), {
      request_path: request.path,
      request_method: request.method,
      router_kind: context.routerKind,
      route_path: context.routePath,
      route_type: context.routeType,
    });
    await posthog.flush();
  } catch (reportingError) {
    console.error('PostHog error reporting failed', reportingError);
  }
};
