/**
 * Authorization for the outreach bot's endpoints: `Authorization: Bearer
 * $ORGANIZER_BOT_TOKEN`. The token must be at least 32 characters; both
 * sides are hashed so the comparison takes the same time whatever is sent.
 */
import 'server-only';
import { bearerTokenMatches } from './botRequests';

export function botAuthorized(request: Request): boolean {
  return bearerTokenMatches(request.headers.get('authorization'), process.env.ORGANIZER_BOT_TOKEN);
}
