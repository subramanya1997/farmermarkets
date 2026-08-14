import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intentLabels: Record<string, string> = {
  farmers_market: "A farmers market",
  public_food_market: "A public food market",
  fresh_produce: "Fresh local produce",
  prepared_food: "Prepared food or a hawker centre",
  food_coop: "A food co-op or pickup point",
  community_garden: "A community garden or urban farm",
  other: "Something else"
};

const helpLabels: Record<string, string> = {
  get_listed: "Get a market or local-food place listed",
  update_listing: "Update or correct a listing",
  coverage_request: "Request coverage for another area",
  operations: "Improve operations or workflows",
  data_partnership: "Share data or discuss a partnership",
  other: "Something else"
};

const submissionSchema = z.object({
  intent: z.enum([
    "farmers_market",
    "public_food_market",
    "fresh_produce",
    "prepared_food",
    "food_coop",
    "community_garden",
    "other"
  ]),
  helpTopics: z.array(z.enum([
    "get_listed",
    "update_listing",
    "coverage_request",
    "operations",
    "data_partnership",
    "other"
  ])).max(6),
  name: z.string().trim().max(100),
  organization: z.string().trim().max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  phone: z.union([z.literal(""), z.string().trim().min(7).max(30).regex(/^[+()0-9 .-]+$/)]),
  message: z.string().trim().max(1200),
  contactPermission: z.boolean(),
  country: z.string().trim().min(1).max(100),
  resultCount: z.number().int().min(0).max(1000000),
  website: z.string().max(200).optional().default("")
}).superRefine((submission, context) => {
  if ((submission.email || submission.phone) && !submission.contactPermission) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contactPermission"],
      message: "Contact permission is required when contact details are provided."
    });
  }
});

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function requestIsAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const hostname = new URL(origin).hostname;
    return hostname === "farmermarkets.app"
      || hostname === "www.farmermarkets.app"
      || hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function isRateLimited(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = rateLimits.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  if (!requestIsAllowed(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 10000) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }

  const body = await request.json().catch(() => null);
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check the submitted information." }, { status: 400 });
  }

  const submission = parsed.data;
  if (submission.website) {
    return NextResponse.json({ ok: true });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DISCOVERY_FROM_EMAIL;
  const to = process.env.DISCOVERY_NOTIFICATION_EMAIL;
  if (!apiKey || !from || !to) {
    return NextResponse.json({ error: "Contact delivery is not configured." }, { status: 503 });
  }

  const intent = intentLabels[submission.intent];
  const helpTopics = submission.helpTopics.map((topic) => helpLabels[topic]);
  const submittedAt = new Date().toISOString();
  const lines = [
    `Intent: ${intent}`,
    `Help requested: ${helpTopics.length ? helpTopics.join(", ") : "None selected"}`,
    `Country filter: ${submission.country}`,
    `Visible result count: ${submission.resultCount}`,
    `Name: ${submission.name || "Not provided"}`,
    `Organization: ${submission.organization || "Not provided"}`,
    `Email: ${submission.email || "Not provided"}`,
    `Phone: ${submission.phone || "Not provided"}`,
    `Contact permission: ${submission.contactPermission ? "Yes" : "No"}`,
    `Message: ${submission.message || "Not provided"}`,
    `Submitted at: ${submittedAt}`
  ];

  const htmlRows = lines.map((line) => {
    const separator = line.indexOf(":");
    const label = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    return `<tr><th align="left" style="padding:8px;border-bottom:1px solid #e4e4e7;vertical-align:top">${escapeHtml(label)}</th><td style="padding:8px;border-bottom:1px solid #e4e4e7">${escapeHtml(value).replaceAll("\n", "<br>")}</td></tr>`;
  }).join("");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: submission.email || undefined,
    subject: `[Farmer Markets] ${intent}`,
    text: lines.join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#18181b"><h1 style="font-size:20px">New discovery request</h1><table style="border-collapse:collapse;width:100%;max-width:700px">${htmlRows}</table></div>`
  });

  if (error) {
    console.error("Resend discovery submission failed", error.name);
    return NextResponse.json({ error: "We could not send your request. Please try again." }, { status: 502 });
  }

  return NextResponse.json(
    { ok: true, id: data?.id },
    { headers: { "Cache-Control": "no-store" } }
  );
}
