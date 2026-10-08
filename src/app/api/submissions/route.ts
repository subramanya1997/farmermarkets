import { after, NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { DatabaseUnavailableError, dbSchema, getDb } from "@/db";
import { flushPostHogLogs, getPostHogLogLogger } from "@/instrumentation";
import { getPostHogServer, posthogRequestIdentity } from "@/lib/posthogServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const submissionSchema = z.object({
  type: z.enum(["correction", "new_market", "claim", "contact"]),
  market_id: z.string().max(64).optional(),
  // Public pages know a market by slug, not id; resolved to market_id below.
  market_slug: z.string().max(200).regex(/^[a-z0-9-]+$/).optional(),
  email: z.string().email().max(254).optional(),
  payload: z.record(z.string(), z.unknown()),
  // Honeypot: real users never fill this; bots do.
  website_url: z.string().max(0).optional(),
});

function logSubmissionOutcome(
  body: string,
  severityText: "INFO" | "WARN",
  attributes: Record<string, boolean | string>,
) {
  getPostHogLogLogger()?.emit({ body, severityText, attributes });
  after(async () => {
    await flushPostHogLogs();
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    logSubmissionOutcome("market_submission_rejected", "WARN", { reason: "invalid_json" });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    logSubmissionOutcome("market_submission_rejected", "WARN", { reason: "invalid_submission" });
    return NextResponse.json(
      { error: "Invalid submission", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { type, market_id, market_slug, email, payload } = parsed.data;

  if (JSON.stringify(payload).length > 20_000) {
    logSubmissionOutcome("market_submission_rejected", "WARN", { reason: "payload_too_large" });
    return NextResponse.json({ error: "Submission too large" }, { status: 413 });
  }

  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return NextResponse.json(
        { error: "Submissions are not accepting entries right now" },
        { status: 503 },
      );
    }
    throw error;
  }

  let resolvedMarketId: string | null = null;
  if (market_id) {
    const market = await db
      .select({ id: dbSchema.markets.id })
      .from(dbSchema.markets)
      .where(eq(dbSchema.markets.id, market_id))
      .limit(1);
    if (!market.length) {
      return NextResponse.json({ error: "Unknown market_id" }, { status: 404 });
    }
    resolvedMarketId = market_id;
  } else if (market_slug) {
    // Best-effort: a stale or unknown slug still records a submission, with
    // the slug preserved in the payload for hand review.
    const market = await db
      .select({ id: dbSchema.markets.id })
      .from(dbSchema.markets)
      .where(eq(dbSchema.markets.slug, market_slug))
      .limit(1);
    resolvedMarketId = market[0]?.id ?? null;
  }

  const [row] = await db
    .insert(dbSchema.submissions)
    .values({
      type,
      marketId: resolvedMarketId,
      email: email ?? null,
      payload: market_slug ? { ...payload, market_slug } : payload,
    })
    .returning({ id: dbSchema.submissions.id, createdAt: dbSchema.submissions.createdAt });

  logSubmissionOutcome("market_submission_persisted", "INFO", {
    submission_type: type,
    has_market: Boolean(resolvedMarketId),
    has_email: Boolean(email),
  });

  // The durable row above is the record; this event only counts it. No email
  // or payload content is sent, and an analytics failure never fails the request.
  const posthog = getPostHogServer();
  const { distinctId, sessionId } = posthogRequestIdentity(request.headers);
  if (posthog && distinctId) {
    try {
      posthog.capture({
        distinctId,
        event: "Submission Received",
        properties: {
          submission_type: type,
          has_market: Boolean(resolvedMarketId),
          has_email: Boolean(email),
          $process_person_profile: false,
          ...(sessionId ? { $session_id: sessionId } : {}),
        },
      });
      await posthog.flush();
    } catch (error) {
      console.error("PostHog capture failed", error);
    }
  }

  return NextResponse.json({ ok: true, id: row.id, created_at: row.createdAt }, { status: 201 });
}
