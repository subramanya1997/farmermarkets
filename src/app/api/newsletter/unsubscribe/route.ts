import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { DatabaseUnavailableError, dbSchema, getDb } from "@/db";
import { isWellFormedToken, syncResendContact } from "@/lib/newsletter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Two callers:
 * - the unsubscribe page's button, a form post with `token` in the body,
 *   which is redirected back to the page to show the result;
 * - a mail client's one-click unsubscribe (RFC 8058), which posts
 *   `List-Unsubscribe=One-Click` to the URL in the `List-Unsubscribe` header,
 *   token in the query string, and only needs a 200.
 *
 * No origin check: mail providers post from their own servers, and the token
 * is the authorization. Unknown tokens get the same answer as known ones.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  const token = new URL(request.url).searchParams.get("token") ?? form?.get("token");

  const respond = (status: "done" | "unavailable") =>
    oneClick
      ? new NextResponse(status === "done" ? "Unsubscribed" : "Try again later", { status: status === "done" ? 200 : 503 })
      : NextResponse.redirect(new URL(`/newsletter/unsubscribe?status=${status}`, request.url), 303);

  if (!isWellFormedToken(token)) return respond("done");

  let db;
  try {
    db = getDb();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return respond("unavailable");
    throw error;
  }

  const subscribers = dbSchema.newsletterSubscribers;
  const [row] = await db
    .update(subscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date(), confirmTokenHash: null, confirmExpiresAt: null })
    .where(eq(subscribers.unsubscribeToken, token))
    .returning({ email: subscribers.email });

  if (row) await syncResendContact(row.email, true);
  return respond("done");
}
