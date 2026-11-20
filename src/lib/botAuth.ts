/**
 * Authorization for the bots' endpoints under /api/bot.
 *
 * - `ORGANIZER_BOT_TOKEN`: the outreach bot (docs/organizer-bot.md).
 * - `LISTING_BOT_TOKEN`: the operator-growth bot's own token for the listing
 *   API (docs/listing-bot.md). Optional: until it is set, that bot uses the
 *   organizer token, and its writes are logged as `outreach-bot`.
 * - `LISTING_BOT_MERGE_TOKEN`: may also publish merges (301 redirects) that
 *   name who approved them. Without it a merge waits in /admin/review.
 *
 * Every token must be at least 32 characters; both sides are hashed so the
 * comparison takes the same time whatever is sent.
 */
import 'server-only';
import { bearerTokenMatches } from './botRequests';

export function botAuthorized(request: Request): boolean {
  return bearerTokenMatches(request.headers.get('authorization'), process.env.ORGANIZER_BOT_TOKEN);
}

export interface BotIdentity {
  /** Who the audit log names for this call. */
  actor: 'outreach-bot' | 'listing-bot';
  /** May publish an approved merge without waiting for an admin. */
  canMerge: boolean;
}

/** Who is calling the listing API, or null when no token matches. */
export function listingBotIdentity(request: Request): BotIdentity | null {
  const header = request.headers.get('authorization');
  if (bearerTokenMatches(header, process.env.LISTING_BOT_MERGE_TOKEN)) return { actor: 'listing-bot', canMerge: true };
  if (bearerTokenMatches(header, process.env.LISTING_BOT_TOKEN)) return { actor: 'listing-bot', canMerge: false };
  if (bearerTokenMatches(header, process.env.ORGANIZER_BOT_TOKEN)) return { actor: 'outreach-bot', canMerge: false };
  return null;
}
