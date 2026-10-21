"use client";

/**
 * What this visit has done so far, for deciding whether a visitor prompt has
 * earned the right to appear (src/components/VisitorPrompts.tsx).
 *
 * `trackEvent` reports every analytics event here, so prompts react to the
 * same events PostHog sees without any component wiring its own listener.
 * Counters live in sessionStorage: one tab's visit, gone when it closes.
 */

export const SIGNAL_EVENT = "fm:signal";
export const CONTEXT_EVENT = "fm:prompt-context";

/** Clicks that mean a visitor got what they came for on a market page. */
export const OUTCOME_EVENTS = new Set([
  "Official Market Website Opened",
  "Market Directions Opened",
  "Market Phone Clicked",
]);

export const SEARCH_MISS_EVENTS = new Set(["Market Search No Results", "City Search No Results"]);

export interface SignalDetail {
  name: string;
  properties: Record<string, unknown>;
}

/** What the current page is about, set by the page itself. */
export type PromptContext =
  | { kind: "market"; path: string; slug: string; name: string; cityName?: string }
  | { kind: "city"; path: string; name: string; stateName?: string };

interface VisitState {
  /** Distinct market slugs viewed this visit, in order. */
  marketViews: string[];
  /** Distinct market slugs with a website, directions or phone click. */
  outcomeMarkets: string[];
}

const VISIT_KEY = "fm.visit.v1";

function readVisit(): VisitState {
  try {
    const raw = window.sessionStorage.getItem(VISIT_KEY);
    if (raw) return JSON.parse(raw) as VisitState;
  } catch {
    // Storage blocked or corrupt: start the visit fresh.
  }
  return { marketViews: [], outcomeMarkets: [] };
}

function writeVisit(state: VisitState) {
  try {
    window.sessionStorage.setItem(VISIT_KEY, JSON.stringify(state));
  } catch {
    // Best effort only.
  }
}

export function visitState(): VisitState {
  return typeof window === "undefined" ? { marketViews: [], outcomeMarkets: [] } : readVisit();
}

function addUnique(list: string[], value: unknown): string[] {
  return typeof value === "string" && value && !list.includes(value) ? [...list, value].slice(-50) : list;
}

/** Called by `trackEvent` for every event. */
export function recordSignal(name: string, properties: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const page = currentContext();
  const slug = page?.kind === "market" ? page.slug : undefined;

  if (name === "Market Detail Viewed" || OUTCOME_EVENTS.has(name)) {
    const state = readVisit();
    writeVisit({
      marketViews: name === "Market Detail Viewed" ? addUnique(state.marketViews, slug ?? properties.market_id) : state.marketViews,
      outcomeMarkets: OUTCOME_EVENTS.has(name) ? addUnique(state.outcomeMarkets, slug ?? properties.market_id) : state.outcomeMarkets,
    });
  }

  window.dispatchEvent(new CustomEvent<SignalDetail>(SIGNAL_EVENT, { detail: { name, properties } }));
}

let context: PromptContext | null = null;

/** Pages call this on mount; prompts read it to word themselves. */
export function setPromptContext(next: PromptContext) {
  context = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONTEXT_EVENT));
}

/** The context for the page on screen, or null if it belongs to another page. */
export function currentContext(): PromptContext | null {
  if (typeof window === "undefined" || !context) return null;
  return context.path === window.location.pathname ? context : null;
}
