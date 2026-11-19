import { createHmac } from 'node:crypto';

/**
 * A stand-in for a visitor that cannot be turned back into an IP address:
 * an HMAC of the address and user agent under a server secret and the
 * calendar day, so the same phone looks the same for a day and unrelated
 * the next.
 */
export function visitorHash(input: { ip: string; userAgent: string; day: string; secret: string }): string {
  return createHmac('sha256', `${input.secret}:${input.day}`).update(`${input.ip}\n${input.userAgent}`).digest('base64url').slice(0, 32);
}
