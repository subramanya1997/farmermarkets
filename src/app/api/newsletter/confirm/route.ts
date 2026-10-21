import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { DatabaseUnavailableError, dbSchema, getDb } from "@/db";
import { requestOriginAllowed } from "@/lib/formGuards";
import { hashToken, isWellFormedToken, sendWelcomeEmail, syncResendContact } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultPage(request: Request, status: "confirmed" | "expired" | "invalid" | "unavailable") {
  return NextResponse.redirect(new URL(`/newsletter/confirm?status=${status}`, request.url), 303);
}

// The confirm page's button posts here; see src/lib/newsletter.ts for why
// confirmation is a POST and not a GET on the emailed link.
export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (!isWellFormedToken(token)) return resultPage(request, "invalid");

  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return resultPage(request, "unavailable");
    throw error;
  }

  const subscribers = dbSchema.newsletterSubscribers;
  const [row] = await db
    .select()
    .from(subscribers)
    .where(and(eq(subscribers.confirmTokenHash, hashToken(token)), eq(subscribers.status, "pending")))
    .limit(1);

  if (!row) return resultPage(request, "invalid");
  if (!row.confirmExpiresAt || row.confirmExpiresAt.getTime() < Date.now()) {
    return resultPage(request, "expired");
  }

  await db
    .update(subscribers)
    .set({ status: "confirmed", confirmedAt: new Date(), confirmTokenHash: null, confirmExpiresAt: null })
    .where(eq(subscribers.id, row.id));
  await Promise.all([
    syncResendContact(row.email, false),
    sendWelcomeEmail({ email: row.email, unsubscribeToken: row.unsubscribeToken, zip: row.zip }),
  ]);

  return resultPage(request, "confirmed");
}
