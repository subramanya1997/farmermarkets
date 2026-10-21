import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { DatabaseUnavailableError, dbSchema, getDb } from "@/db";
import { createRateLimiter, requestOriginAllowed, requestTooLarge } from "@/lib/formGuards";
import {
  CONFIRM_RESEND_COOLDOWN_MS,
  CONFIRM_TTL_MS,
  NEWSLETTER_SOURCES,
  hashToken,
  newToken,
  newsletterMailConfig,
  normalizeEmail,
  sendConfirmationEmail,
} from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  source: z.enum(NEWSLETTER_SOURCES),
  path: z.string().max(300).regex(/^\//).optional(),
  market_slug: z.string().max(200).regex(/^[a-z0-9-]+$/).optional(),
  // Honeypot: hidden from people, filled by bots.
  website: z.string().max(2000).optional(),
});

const isRateLimited = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

// Every accepted request gets the same answer, whether the address is new,
// pending or already confirmed, so the form cannot be used to find out who
// is on the list.
const ACCEPTED = { ok: true };

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  if (requestTooLarge(request, 4000)) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const { zip, source, path, market_slug: marketSlug, website } = parsed.data;
  if (website) return NextResponse.json(ACCEPTED);

  const mail = newsletterMailConfig();
  let db;
  try {
    db = getDb();
  } catch (error) {
    if (!(error instanceof DatabaseUnavailableError)) throw error;
  }
  if (!mail || !db) {
    return NextResponse.json({ error: "Signups are not open right now." }, { status: 503 });
  }

  const email = normalizeEmail(parsed.data.email);
  const now = new Date();
  const subscribers = dbSchema.newsletterSubscribers;
  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email)).limit(1);

  if (existing?.status === "confirmed") {
    // Already on the list: keep a newly given ZIP, send nothing.
    if (zip && zip !== existing.zip) {
      await db.update(subscribers).set({ zip }).where(eq(subscribers.id, existing.id));
    }
    return NextResponse.json(ACCEPTED);
  }

  if (existing?.confirmSentAt && now.getTime() - existing.confirmSentAt.getTime() < CONFIRM_RESEND_COOLDOWN_MS) {
    return NextResponse.json(ACCEPTED);
  }

  const confirmToken = newToken();
  const signup = {
    status: "pending" as const,
    zip: zip ?? existing?.zip ?? null,
    source,
    sourcePath: path ?? null,
    marketSlug: marketSlug ?? null,
    confirmTokenHash: hashToken(confirmToken),
    confirmExpiresAt: new Date(now.getTime() + CONFIRM_TTL_MS),
    confirmSentAt: now,
  };

  let unsubscribeToken: string;
  if (existing) {
    // Pending again, or an unsubscribed reader signing back up: a fresh
    // confirmation is required either way.
    await db.update(subscribers).set(signup).where(eq(subscribers.id, existing.id));
    unsubscribeToken = existing.unsubscribeToken;
  } else {
    unsubscribeToken = newToken();
    await db
      .insert(subscribers)
      .values({ email, unsubscribeToken, ...signup })
      // Two tabs submitting at once: the second insert just refreshes the row.
      .onConflictDoUpdate({ target: subscribers.email, set: signup });
    const [row] = await db
      .select({ unsubscribeToken: subscribers.unsubscribeToken })
      .from(subscribers)
      .where(eq(subscribers.email, email))
      .limit(1);
    unsubscribeToken = row.unsubscribeToken;
  }

  try {
    await sendConfirmationEmail(mail, { email, confirmToken, unsubscribeToken });
  } catch (error) {
    console.error("Newsletter confirmation email failed", error);
    // Let the reader retry right away instead of waiting out the cooldown.
    await db.update(subscribers).set({ confirmSentAt: null }).where(eq(subscribers.email, email));
    return NextResponse.json(
      { error: "We could not send the confirmation email. Please try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json(ACCEPTED);
}
