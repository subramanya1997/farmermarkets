/**
 * Headless browsers that say what they are in the user agent. Analytics skip
 * them so crawler fleets do not drown out real visitors.
 *
 * Since Nov 2026 a fleet announcing itself as `Lightpanda/1.0` has loaded
 * about 5,000 pages a day from rotating residential IPs, which is far more
 * than real visitors. Only self-declared automation is matched here: the
 * older fleet that sends a normal Chrome user agent cannot be told apart by
 * the agent string and is filtered at analysis time instead.
 */
const AUTOMATED_USER_AGENT = /\b(Lightpanda|HeadlessChrome|PhantomJS)\b/i;

export function isAutomatedUserAgent(userAgent: string | undefined | null): boolean {
  return Boolean(userAgent && AUTOMATED_USER_AGENT.test(userAgent));
}

/** True in a browser whose user agent declares it is automated. */
export function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && isAutomatedUserAgent(navigator.userAgent);
}
