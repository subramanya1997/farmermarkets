import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, dbSchema } from "@/db";

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

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid submission", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { type, market_id, market_slug, email, payload } = parsed.data;

  if (JSON.stringify(payload).length > 20_000) {
    return NextResponse.json({ error: "Submission too large" }, { status: 413 });
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

  return NextResponse.json({ ok: true, id: row.id, created_at: row.createdAt }, { status: 201 });
}
