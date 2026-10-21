"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CalendarHeart, Check, MessageCircleQuestion, SearchX, X } from "lucide-react";
import { posthogRequestHeaders, trackEvent } from "@/lib/analytics";
import { displaySerif } from "@/lib/fonts";
import { canShowPrompt, markPromptOutcome, markPromptShown } from "@/lib/promptBudget";
import {
  CONTEXT_EVENT,
  OUTCOME_EVENTS,
  SEARCH_MISS_EVENTS,
  SIGNAL_EVENT,
  currentContext,
  visitState,
  type PromptContext,
  type SignalDetail,
} from "@/lib/visitSignals";

/**
 * Small questions that appear only after a visitor has shown why they came,
 * never on arrival. PostHog showed the old arrival popup was answered 0 times
 * in 10 showings, while real visitors land on a market or city page from
 * search, read for about 20 seconds, and either tap Website / Directions /
 * Phone or leave. So each prompt is tied to one of those moments:
 *
 * - search_miss: a search found nothing. Offer to add it.
 * - listing_check: they tapped Website / Directions / Phone and came back.
 *   Ask if the listing was right; a "no" becomes a correction to review.
 * - trip_planner: 3+ markets viewed, or 2+ acted on. Offer the newsletter.
 * - unmet_need: 35s of reading, scrolled to the end, no action. Ask what
 *   was missing.
 *
 * Frequency rules live in src/lib/promptBudget.ts. Every prompt reports
 * "Prompt Shown", "Prompt Answered" or "Prompt Dismissed" with a `prompt`
 * property, and PostHog adds the page context, so the questions can be
 * charted against each other.
 */

const LISTING_CHECK_FALLBACK_MS = 15_000;
const LISTING_CHECK_MIN_AWAY_MS = 3_000;
const TRIP_PLANNER_DELAY_MS = 5_000;
const UNMET_NEED_DWELL_S = 35;
const UNMET_NEED_SCROLL = 0.7;

type Active =
  | { id: "search_miss"; query: string; searchSource: string }
  | { id: "listing_check"; slug: string; name: string }
  | { id: "trip_planner"; place?: string }
  | { id: "unmet_need"; context: PromptContext };

type Step = "ask" | "detail" | "done";

const LISTING_ISSUES = [
  { id: "accurate", label: "Yes, all good" },
  { id: "hours_wrong", label: "Hours or days were off" },
  { id: "closed", label: "It's closed now" },
  { id: "other", label: "Something else" },
] as const;

const MARKET_NEEDS = [
  { id: "open_this_week", label: "If it's open this week" },
  { id: "vendors", label: "What the vendors sell" },
  { id: "payment", label: "SNAP/EBT or payment" },
  { id: "getting_there", label: "Parking or getting there" },
  { id: "other", label: "Something else" },
] as const;

const CITY_NEEDS = [
  { id: "open_today", label: "A market open today" },
  { id: "snap", label: "Markets taking SNAP/EBT" },
  { id: "winter", label: "Winter or indoor markets" },
  { id: "produce", label: "Specific produce" },
  { id: "other", label: "Something else" },
] as const;

async function postSubmission(body: Record<string, unknown>) {
  try {
    await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...posthogRequestHeaders() },
      body: JSON.stringify(body),
    });
  } catch {
    // The analytics event already recorded the answer.
  }
}

export function VisitorPrompts() {
  const pathname = usePathname();
  const [active, setActive] = useState<Active | null>(null);
  const [step, setStep] = useState<Step>("ask");
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef<Active | null>(null);
  const pendingCheck = useRef<{ slug: string; name: string } | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const actedOnPage = useRef(false);

  const show = useCallback((next: Active, trigger: string) => {
    if (activeRef.current || !canShowPrompt(next.id)) return;
    activeRef.current = next;
    markPromptShown(next.id);
    setActive(next);
    setStep("ask");
    setNote("");
    setError(null);
    trackEvent("Prompt Shown", { prompt: next.id, trigger });
  }, []);

  const close = useCallback((outcome: "answered" | "dismissed" | "silent") => {
    const current = activeRef.current;
    if (!current) return;
    if (outcome !== "silent") markPromptOutcome(current.id, outcome);
    if (outcome === "dismissed") trackEvent("Prompt Dismissed", { prompt: current.id });
    activeRef.current = null;
    setActive(null);
  }, []);

  const answer = useCallback((value: string, extra: Record<string, string | undefined> = {}) => {
    const current = activeRef.current;
    if (!current) return;
    markPromptOutcome(current.id, "answered");
    trackEvent("Prompt Answered", { prompt: current.id, answer: value, ...extra });
  }, []);

  // A new page starts fresh: drop a prompt that belonged to the old one.
  useEffect(() => {
    actedOnPage.current = false;
    pendingCheck.current = null;
    if (activeRef.current && activeRef.current.id !== "trip_planner") close("silent");
  }, [pathname, close]);

  // React to analytics events.
  useEffect(() => {
    let tripTimer: number | undefined;
    let fallbackTimer: number | undefined;

    const onSignal = (event: Event) => {
      const { name, properties } = (event as CustomEvent<SignalDetail>).detail;
      const context = currentContext();

      if (SEARCH_MISS_EVENTS.has(name) && typeof properties.query === "string" && properties.query !== "[redacted]") {
        show({ id: "search_miss", query: properties.query, searchSource: String(properties.search_source ?? "") }, name);
        return;
      }

      if (OUTCOME_EVENTS.has(name)) {
        actedOnPage.current = true;
        if (context?.kind === "market") {
          pendingCheck.current = { slug: context.slug, name: context.name };
          // Website links open a new tab and directions leave the browser, so
          // the check waits for them to come back; a phone tap on desktop
          // never leaves, hence the fallback.
          window.clearTimeout(fallbackTimer);
          fallbackTimer = window.setTimeout(() => {
            if (pendingCheck.current && hiddenAt.current === null) {
              const target = pendingCheck.current;
              pendingCheck.current = null;
              show({ id: "listing_check", ...target }, "outcome_no_return");
            }
          }, LISTING_CHECK_FALLBACK_MS);
        }
      }

      if (name === "Market Detail Viewed" || OUTCOME_EVENTS.has(name)) considerTripPlanner();
    };

    function considerTripPlanner() {
      const visit = visitState();
      if (visit.marketViews.length < 3 && visit.outcomeMarkets.length < 2) return;
      window.clearTimeout(tripTimer);
      tripTimer = window.setTimeout(() => {
        if (pendingCheck.current) return; // the listing check comes first
        const now = currentContext();
        const place = now?.kind === "market" ? now.cityName : now?.kind === "city" ? now.name : undefined;
        show({ id: "trip_planner", place }, visit.outcomeMarkets.length >= 2 ? "two_outcomes" : "three_markets");
      }, TRIP_PLANNER_DELAY_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (pendingCheck.current && away >= LISTING_CHECK_MIN_AWAY_MS) {
        const target = pendingCheck.current;
        pendingCheck.current = null;
        window.clearTimeout(fallbackTimer);
        show({ id: "listing_check", ...target }, "returned_after_outcome");
      }
    };

    window.addEventListener(SIGNAL_EVENT, onSignal);
    document.addEventListener("visibilitychange", onVisibility);
    // On a full page load the page's own "Market Detail Viewed" fires before
    // this listener exists, so check what the visit has already done.
    considerTripPlanner();
    return () => {
      window.removeEventListener(SIGNAL_EVENT, onSignal);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(tripTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [show]);

  // Read for a while, reach the end, act on nothing: ask what was missing.
  useEffect(() => {
    let dwell = 0;
    let maxScroll = 0;
    let context = currentContext();

    const onContext = () => {
      context = currentContext();
    };
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      maxScroll = Math.max(maxScroll, scrollable <= 0 ? 1 : window.scrollY / scrollable);
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !context) return;
      dwell += 1;
      if (dwell >= UNMET_NEED_DWELL_S && maxScroll >= UNMET_NEED_SCROLL && !actedOnPage.current) {
        window.clearInterval(tick);
        show({ id: "unmet_need", context }, "read_without_action");
      }
    }, 1000);

    window.addEventListener(CONTEXT_EVENT, onContext);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearInterval(tick);
      window.removeEventListener(CONTEXT_EVENT, onContext);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname, show]);

  // Escape closes, like any popover.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(step === "done" ? "silent" : "dismissed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, close]);

  // The thank-you note leaves by itself.
  useEffect(() => {
    if (step !== "done" || !active) return;
    const timer = window.setTimeout(() => close("silent"), active.id === "trip_planner" ? 6000 : 3500);
    return () => window.clearTimeout(timer);
  }, [step, active, close]);

  if (!active) return null;

  const finish = () => {
    setBusy(false);
    setStep("done");
  };

  async function onSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "prompt", path: window.location.pathname }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Something went wrong. Please try again.");
      }
      answer("subscribed");
      trackEvent("Newsletter Signup Submitted", { source: "prompt", has_zip: false });
      finish();
    } catch (caught) {
      setBusy(false);
      setError((caught as Error).message);
    }
  }

  let icon: ReactNode;
  let eyebrow: string;
  let title: string;
  let body: ReactNode;

  if (active.id === "search_miss") {
    icon = <SearchX className="h-4 w-4" />;
    eyebrow = "No match yet";
    title = `Nothing for “${active.query}” yet`;
    body =
      step === "done" ? (
        <Done>Thanks. We&apos;ll look for markets matching “{active.query}”.</Done>
      ) : (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Want us to add markets for it? It tells us where to look next.</p>
          <Actions>
            <Primary
              onClick={() => {
                answer("add_it", { query: active.query });
                void postSubmission({
                  type: "new_market",
                  payload: { source: "search_miss", query: active.query, search_source: active.searchSource, page_path: window.location.pathname },
                });
                finish();
              }}
            >
              Yes, add it
            </Primary>
            <Secondary onClick={() => close("dismissed")}>Not now</Secondary>
          </Actions>
        </>
      );
  } else if (active.id === "listing_check") {
    icon = <Check className="h-4 w-4" />;
    eyebrow = "Quick check";
    title = `Was ${active.name} as listed?`;
    body =
      step === "done" ? (
        <Done>Thank you. That helps the next person heading there.</Done>
      ) : step === "detail" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            answer("other", { has_note: note.trim() ? "yes" : "no" });
            void postSubmission({
              type: "correction",
              market_slug: active.slug,
              payload: { source: "listing_check", issue: "other", note: note.trim().slice(0, 500) },
            });
            finish();
          }}
        >
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="What was different?"
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <Actions>
            <Primary type="submit">Send</Primary>
          </Actions>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {LISTING_ISSUES.map((issue) => (
            <Chip
              key={issue.id}
              onClick={() => {
                if (issue.id === "other") return setStep("detail");
                answer(issue.id);
                if (issue.id !== "accurate") {
                  void postSubmission({ type: "correction", market_slug: active.slug, payload: { source: "listing_check", issue: issue.id } });
                }
                finish();
              }}
            >
              {issue.label}
            </Chip>
          ))}
        </div>
      );
  } else if (active.id === "trip_planner") {
    icon = <CalendarHeart className="h-4 w-4" />;
    eyebrow = "Planning a market run?";
    title = active.place ? `Market days near ${active.place}, weekly` : "Market days near you, weekly";
    body =
      step === "done" ? (
        <Done>Check your inbox for a confirmation link.</Done>
      ) : (
        <form onSubmit={onSubscribe}>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">One short email with what&apos;s open and in season. Unsubscribe any time.</p>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="prompt-email">Email address</label>
            <input
              id="prompt-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <Primary type="submit" disabled={busy}>{busy ? "Sending" : "Subscribe"}</Primary>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      );
  } else {
    const isMarket = active.context.kind === "market";
    const needs = isMarket ? MARKET_NEEDS : CITY_NEEDS;
    icon = <MessageCircleQuestion className="h-4 w-4" />;
    eyebrow = "Help us improve this page";
    title = "What were you hoping to find?";
    body =
      step === "done" ? (
        <Done>Thanks. We read every answer.</Done>
      ) : step === "detail" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            answer("other", { has_note: note.trim() ? "yes" : "no" });
            if (note.trim()) {
              void postSubmission({
                type: "contact",
                ...(active.context.kind === "market" ? { market_slug: active.context.slug } : {}),
                payload: { source: "unmet_need", page_path: window.location.pathname, note: note.trim().slice(0, 500) },
              });
            }
            finish();
          }}
        >
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="Tell us in a few words"
            className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <Actions>
            <Primary type="submit">Send</Primary>
          </Actions>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {needs.map((need) => (
            <Chip
              key={need.id}
              onClick={() => {
                if (need.id === "other") return setStep("detail");
                answer(need.id);
                finish();
              }}
            >
              {need.label}
            </Chip>
          ))}
        </div>
      );
  }

  return (
    <aside
      aria-label={eyebrow}
      aria-live="polite"
      className="prompt-in fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl shadow-zinc-900/15 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[380px] dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        onClick={() => close(step === "done" ? "silent" : "dismissed")}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
      <p className="flex items-center gap-2 pr-8 text-xs font-semibold uppercase tracking-[0.12em] text-green-700 dark:text-green-400">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/30">{icon}</span>
        {eyebrow}
      </p>
      <h2 className={`${displaySerif.className} mt-3 pr-6 text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50`}>
        {title}
      </h2>
      <div className="mt-3">{body}</div>
    </aside>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex items-center gap-2">{children}</div>;
}

function Primary({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-green-800 active:scale-[0.98] disabled:opacity-70"
    >
      {children}
    </button>
  );
}

function Secondary({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </button>
  );
}

function Chip({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition-[border-color,background-color,transform] hover:border-green-600/50 hover:bg-green-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-green-900/20"
    >
      {children}
    </button>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <p className="prompt-done flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
      <Check aria-hidden="true" className="h-4 w-4" />
      {children}
    </p>
  );
}
