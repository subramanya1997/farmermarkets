/**
 * Authorization for the bots' endpoints under /api/bot: `Authorization:
 * Bearer $ORGANIZER_BOT_TOKEN`, for the outreach endpoints
 * (docs/organizer-bot.md) and the listing API (docs/listing-bot.md) alike.
 * The token must be at least 32 characters; both sides are hashed so the
 * comparison takes the same time whatever is sent.
 */
import 'server-only';
import { bearerTokenMatches } from './botRequests';

export function botAuthorized(request: Request): boolean {
  return bearerTokenMatches(request.headers.get('authorization'), process.env.ORGANIZER_BOT_TOKEN);
}

export interface BotIdentity {
  /** Who the audit log names for this call. */
  actor: 'outreach-bot';
}

/** Who is calling the listing API, or null when the token does not match. */
export function listingBotIdentity(request: Request): BotIdentity | null {
  return botAuthorized(request) ? { actor: 'outreach-bot' } : null;
}
