/**
 * Plumbing shared by the listing bot's routes under /api/bot/markets
 * (docs/listing-bot.md): auth, body parsing, and one response shape for
 * every write.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { listingBotIdentity, type BotIdentity } from './botAuth';
import { UNAUTHORIZED, botError, serverError } from './botRoute';
import { isDryRun, issuesOf } from './listingBotRequests';
import { findBotMarket, mergedError, type WriteContext, type WriteResult } from './listingBot';

export { serverError };

type Handler = (identity: BotIdentity) => Promise<Response>;

/** Auth, then the handler; a thrown error becomes a 503 or a logged 500. */
export async function withListingBot(request: Request, what: string, handler: Handler): Promise<Response> {
  const identity = listingBotIdentity(request);
  if (!identity) return UNAUTHORIZED();
  try {
    return await handler(identity);
  } catch (error) {
    return serverError(error, what);
  }
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: botError(400, 'Send a JSON body.') };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: botError(400, 'Invalid request.', { issues: issuesOf(parsed.error) }) };
  return { ok: true, data: parsed.data };
}

export function writeContext(request: Request, identity: BotIdentity, body: { source_note: string; operator_email?: string }): WriteContext {
  return { identity, sourceNote: body.source_note, operatorEmail: body.operator_email, dryRun: isDryRun(request.url) };
}

/** The market a write targets: 404 when unknown, 409 when it was merged away. */
export async function writableMarket(slug: string) {
  const found = await findBotMarket(slug);
  if (!found.ok) return { ok: false as const, response: botError(404, found.error) };
  const merged = mergedError(found);
  if (merged) return { ok: false as const, response: botError(merged.status, merged.error) };
  return { ok: true as const, market: found.market };
}

/** One response shape for every write; `202` when the change waits for an admin. */
export function writeResponse<T extends object>(result: WriteResult<T>, extra: Record<string, unknown> = {}): Response {
  if (!result.ok) return botError(result.status, result.error, result.issues ? { issues: result.issues } : {});
  const pending = 'pending' in result && result.pending === true && !result.dry_run;
  return NextResponse.json(
    {
      ...result,
      ...extra,
      ...(result.changed
        ? {}
        : { message: result.dry_run ? 'Nothing would change.' : pending ? 'Already waiting for an admin.' : 'Nothing changed: the listing already says this.' }),
    },
    { status: pending ? 202 : 200 },
  );
}
