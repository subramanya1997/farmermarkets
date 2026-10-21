/**
 * Cheap abuse guards shared by the public form endpoints (`/api/discovery`,
 * `/api/submissions`). They stop casual cross-site posts and form floods; they
 * are not a defence against a determined attacker, who can forge an Origin and
 * rotate IPs.
 */

const ALLOWED_HOSTS = new Set(["farmermarkets.app", "www.farmermarkets.app", "localhost", "127.0.0.1"]);

/** True when the request has no Origin (same-origin tools, curl) or one of ours. */
export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const hostname = new URL(origin).hostname;
    return ALLOWED_HOSTS.has(hostname) || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

/** True when the declared body size is over `maxBytes`. */
export function requestTooLarge(request: Request, maxBytes: number): boolean {
  return Number(request.headers.get("content-length") || 0) > maxBytes;
}

/**
 * A fixed-window, per-IP limiter. State lives in this server instance's
 * memory, so on Vercel each warm instance counts separately and a cold start
 * resets the window: it caps bursts, not daily totals.
 */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(request: Request): boolean {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const now = Date.now();
    const current = windows.get(ip);

    if (!current || current.resetAt <= now) {
      // Drop expired windows now and then so the map cannot grow without bound.
      if (windows.size > 5000) {
        for (const [key, value] of windows) if (value.resetAt <= now) windows.delete(key);
      }
      windows.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }

    current.count += 1;
    return current.count > max;
  };
}
