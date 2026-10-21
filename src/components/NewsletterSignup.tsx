"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  Apple,
  ArrowRight,
  CalendarDays,
  Carrot,
  Cherry,
  Citrus,
  Grape,
  Leaf,
  LoaderCircle,
  Mail,
  Sprout,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { displaySerif } from "@/lib/fonts";

type Source = "home" | "blog_index" | "blog_post" | "city" | "market";
type Variant = "band" | "card" | "compact";

interface NewsletterSignupProps {
  source: Source;
  /** band: full-width dark green. card: inline light panel. compact: narrow sidebar. */
  variant?: Variant;
  heading?: string;
  blurb?: string;
  marketSlug?: string;
}

const DEFAULT_HEADING = "Never miss market day";
const DEFAULT_BLURB = "The markets near you and what's in season, in one short email.";

const BENEFITS: { icon: LucideIcon; label: string }[] = [
  { icon: CalendarDays, label: "Market days near you" },
  { icon: Sprout, label: "What's in season" },
  { icon: Mail, label: "Once a week at most" },
];

/** Background produce glyphs: position, size, tilt and drift timing. */
const GLYPHS: { icon: LucideIcon; style: CSSProperties }[] = [
  { icon: Carrot, style: { top: "12%", right: "6%", width: 54, "--nl-r": "-18deg", "--nl-d": "11s" } as CSSProperties },
  { icon: Apple, style: { top: "58%", right: "16%", width: 40, "--nl-r": "10deg", "--nl-d": "9s", "--nl-delay": "-3s" } as CSSProperties },
  { icon: Wheat, style: { bottom: "-6%", right: "3%", width: 64, "--nl-r": "14deg", "--nl-d": "13s", "--nl-delay": "-6s" } as CSSProperties },
  { icon: Cherry, style: { top: "8%", right: "28%", width: 36, "--nl-r": "-6deg", "--nl-d": "10s", "--nl-delay": "-2s" } as CSSProperties },
  { icon: Leaf, style: { top: "34%", right: "34%", width: 30, "--nl-r": "28deg", "--nl-d": "12s", "--nl-delay": "-8s" } as CSSProperties },
  { icon: Grape, style: { bottom: "8%", right: "42%", width: 34, "--nl-r": "-12deg", "--nl-d": "14s", "--nl-delay": "-4s" } as CSSProperties },
];

/** Glyphs that float up out of the check mark on success. */
const BURST: { icon: LucideIcon; x: string; r: string; delay: string }[] = [
  { icon: Carrot, x: "-46px", r: "-30deg", delay: "0.25s" },
  { icon: Apple, x: "-14px", r: "12deg", delay: "0.35s" },
  { icon: Leaf, x: "18px", r: "40deg", delay: "0.3s" },
  { icon: Citrus, x: "48px", r: "-16deg", delay: "0.45s" },
];

/** Stagger position for an `nl-reveal` element's entrance. */
function reveal(index: number): { style: CSSProperties } {
  return { style: { "--nl-i": index } as CSSProperties };
}

function GlyphField({ tone, sparse = false }: { tone: string; sparse?: boolean }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${tone}`}>
      {(sparse ? GLYPHS.slice(0, 3) : GLYPHS).map(({ icon: Icon, style }, index) => (
        <Icon key={index} strokeWidth={1.25} className="nl-drift absolute h-auto" style={style} />
      ))}
    </div>
  );
}

/** "Check your inbox", with the check drawing itself and produce floating out of it. */
function SentMessage({ email, dark }: { email: string; dark: boolean }) {
  return (
    <div role="status" className="flex items-start gap-4">
      <div className="relative shrink-0">
        <svg viewBox="0 0 48 48" className="nl-pop h-12 w-12" aria-hidden="true">
          <circle cx="24" cy="24" r="22" fill={dark ? "rgb(255 255 255 / 0.12)" : "rgb(21 128 61 / 0.1)"} />
          <circle
            cx="24" cy="24" r="22" fill="none" pathLength={1} strokeWidth="2.5"
            className={`nl-draw ${dark ? "stroke-lime-300" : "stroke-green-700"}`}
            style={{ "--nl-delay": "0.1s" } as CSSProperties}
          />
          <path
            d="M15 24.5l6 6 12-13" fill="none" pathLength={1} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            className={`nl-draw ${dark ? "stroke-white" : "stroke-green-700"}`}
            style={{ "--nl-delay": "0.45s" } as CSSProperties}
          />
        </svg>
        {BURST.map(({ icon: Icon, x, r, delay }, index) => (
          <Icon
            key={index}
            aria-hidden="true"
            strokeWidth={1.75}
            className={`nl-burst absolute left-3 top-2 h-5 w-5 ${dark ? "text-lime-200" : "text-green-600"}`}
            style={{ "--nl-x": x, "--nl-r": r, "--nl-delay": delay } as CSSProperties}
          />
        ))}
      </div>
      <div className="nl-pop" style={{ "--nl-delay": "0.2s" } as CSSProperties}>
        <p className={`${displaySerif.className} text-2xl font-semibold tracking-tight`}>Check your inbox</p>
        <p className={`mt-1 text-sm leading-relaxed ${dark ? "text-green-50/80" : "text-zinc-600 dark:text-zinc-400"}`}>
          We sent a confirmation link to <span className="font-medium">{email}</span>. Click it and you are on the list.
        </p>
      </div>
    </div>
  );
}

/**
 * Newsletter signup: email plus an optional ZIP so emails can be local.
 * Posts to /api/newsletter/subscribe, which sends a confirmation email; the
 * reader is not on the list until they click it (see src/lib/newsletter.ts).
 */
export function NewsletterSignup({
  source,
  variant = "card",
  heading = DEFAULT_HEADING,
  blurb = DEFAULT_BLURB,
  marketSlug,
}: NewsletterSignupProps) {
  const [email, setEmail] = useState("");
  const [zip, setZip] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const dark = variant === "band";

  // Arm the entrance animation, then play it once the box scrolls into view.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    setVisible(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setError(null);
    setStatus("sending");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          zip,
          source,
          path: window.location.pathname,
          ...(marketSlug ? { market_slug: marketSlug } : {}),
          website,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw Object.assign(new Error(body?.error || "Something went wrong. Please try again."), {
          status: response.status,
        });
      }
      setStatus("sent");
      trackEvent("Newsletter Signup Submitted", { source, has_zip: Boolean(zip.trim()) });
    } catch (caught) {
      setStatus("idle");
      const failure = caught as Error & { status?: number };
      setError(failure.message || "Something went wrong. Please try again.");
      trackEvent("Newsletter Signup Failed", { source, status: failure.status ?? "network_error" });
    }
  }

  const inputBase =
    "h-12 w-full min-w-0 rounded-xl border px-4 text-[15px] outline-none transition-[box-shadow,border-color] duration-200";
  const input = dark
    ? `${inputBase} border-transparent bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-4 focus:ring-lime-300/40`
    : `${inputBase} border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100`;
  const button = `group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold transition-[background-color,transform] duration-200 active:scale-[0.98] disabled:opacity-80 ${
    dark ? "bg-lime-300 text-green-950 hover:bg-lime-200" : "bg-green-700 text-white hover:bg-green-800"
  }`;
  const fine = dark ? "text-green-50/60" : "text-zinc-500 dark:text-zinc-400";

  const form = (rowAt: "sm" | "never"): ReactNode => (
    <form onSubmit={onSubmit} noValidate>
      <div className={`flex flex-col gap-2.5 ${rowAt === "sm" ? "sm:flex-row" : ""}`}>
        <label className="sr-only" htmlFor={`newsletter-email-${source}`}>Email address</label>
        <input
          id={`newsletter-email-${source}`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${input} ${rowAt === "sm" ? "sm:flex-1" : ""}`}
        />
        <label className="sr-only" htmlFor={`newsletter-zip-${source}`}>ZIP code (optional)</label>
        <input
          id={`newsletter-zip-${source}`}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          placeholder="ZIP (optional)"
          value={zip}
          onChange={(event) => setZip(event.target.value.replace(/\D/g, ""))}
          className={`${input} ${rowAt === "sm" ? "sm:w-36" : ""}`}
        />
        {/* Honeypot: hidden from people and screen readers. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          className="hidden"
        />
        <button type="submit" disabled={status === "sending"} className={button}>
          {status === "sending" ? (
            <>
              <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
              Sending
            </>
          ) : (
            <>
              Subscribe
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </>
          )}
        </button>
      </div>
      {error ? (
        <p role="alert" className={`mt-2.5 text-sm font-medium ${dark ? "text-red-200" : "text-red-600 dark:text-red-400"}`}>
          {error}
        </p>
      ) : (
        <p className={`mt-2.5 text-xs ${fine}`}>
          Free. Unsubscribe any time. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>.
        </p>
      )}
    </form>
  );

  const body = status === "sent" ? <SentMessage email={email.trim()} dark={dark} /> : null;
  const rootProps = {
    ref: rootRef,
    "aria-label": "Newsletter signup",
    ...(visible === null ? {} : { "data-visible": String(visible) }),
  };

  if (variant === "band") {
    return (
      <section
        {...rootProps}
        // The mobile menu's "Get the market note" links here.
        id="newsletter"
        className="relative isolate scroll-mt-24 overflow-hidden rounded-3xl bg-gradient-to-br from-green-950 via-green-900 to-emerald-800 px-6 py-12 text-white shadow-xl shadow-green-950/10 sm:px-12 sm:py-16"
      >
        <div aria-hidden="true" className="nl-glow absolute -left-1/4 -top-1/2 -z-10 h-[160%] w-[70%] rounded-full bg-lime-300/15 blur-3xl" />
        <GlyphField tone="text-white/[0.13]" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div>
            <p {...reveal(0)} className="nl-reveal inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-lime-200 ring-1 ring-white/15">
              <Sprout aria-hidden="true" className="h-3.5 w-3.5" />
              The market note
            </p>
            <h2 {...reveal(1)} className={`nl-reveal ${displaySerif.className} mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl`}>
              {heading}
            </h2>
            <p {...reveal(2)} className="nl-reveal mt-4 max-w-md text-lg leading-relaxed text-green-50/80">{blurb}</p>
            <ul {...reveal(3)} className="nl-reveal mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-green-50/90">
              {BENEFITS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5 text-lime-200" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
          {/* Fixed minimum height so swapping the form for the success
              message doesn't make the whole band jump. */}
          <div {...reveal(4)} className="nl-reveal flex min-h-[16.5rem] flex-col justify-center rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15 backdrop-blur-sm sm:p-7">
            {body ?? (
              <>
                <p className="mb-4 text-sm font-medium text-green-50/90">Get it in your inbox</p>
                {form("never")}
              </>
            )}
          </div>
        </div>
      </section>
    );
  }

  if (variant === "compact") {
    return (
      <section
        {...rootProps}
        className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="relative h-20 overflow-hidden bg-gradient-to-br from-green-900 to-emerald-700">
          <GlyphField tone="text-white/[0.16]" sparse />
        </div>
        <div className="px-5 pb-5">
          {/* Overlaps the strip above; outside it so the strip's clipping can't cut it off. */}
          <span className="relative -mt-6 mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700">
            <Mail aria-hidden="true" className="h-5 w-5 text-green-700 dark:text-green-400" />
          </span>
          {body ?? (
            <>
              <h2 {...reveal(0)} className={`nl-reveal ${displaySerif.className} text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50`}>
                {heading}
              </h2>
              <p {...reveal(1)} className="nl-reveal mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{blurb}</p>
              <div {...reveal(2)} className="nl-reveal mt-4">{form("never")}</div>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      {...rootProps}
      className="relative isolate overflow-hidden rounded-3xl border border-green-700/15 bg-gradient-to-br from-green-50 via-white to-lime-50 p-6 sm:p-10 dark:border-green-500/20 dark:from-green-950/50 dark:via-zinc-900 dark:to-zinc-900"
    >
      <GlyphField tone="text-green-700/[0.08] dark:text-green-400/[0.08]" />
      <div className="relative">
        {body ?? (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <span
              {...reveal(0)}
              className="nl-reveal flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-green-700 text-white shadow-lg shadow-green-700/20"
            >
              <Mail aria-hidden="true" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 {...reveal(1)} className={`nl-reveal ${displaySerif.className} text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50`}>
                {heading}
              </h2>
              <p {...reveal(2)} className="nl-reveal mt-2 max-w-xl leading-relaxed text-zinc-600 dark:text-zinc-400">{blurb}</p>
              <div {...reveal(3)} className="nl-reveal mt-6 max-w-2xl">{form("sm")}</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
