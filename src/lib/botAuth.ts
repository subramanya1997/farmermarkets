/**
 * Authorization for the outreach bot's endpoints: `Authorization: Bearer
 * $ORGANIZER_BOT_TOKEN`. The token must be at least 32 characters; both
 * sides are hashed so the comparison takes the same time whatever is sent.
 */
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function botAuthorized(request: Request): boolean {
  const expected = process.env.ORGANIZER_BOT_TOKEN?.trim();
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return false;
  return timingSafeEqual(digest(match[1].trim()), digest(expected));
}
