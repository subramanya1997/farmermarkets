"use client";

/**
 * How often visitor prompts may appear. The rules, in order:
 *
 * - Never to automated browsers (`navigator.webdriver`).
 * - At most one prompt per visit (tab session).
 * - After any prompt, nothing for GLOBAL_COOLDOWN_DAYS.
 * - A prompt the visitor answered stays away ANSWERED_DAYS; one they closed,
 *   DISMISSED_DAYS.
 *
 * A search that finds nothing is the exception to the first two rules: the
 * visitor just asked for something we lack, so offering to add it is an
 * answer, not an interruption. It still has its own cooldown.
 */

export type PromptId = "search_miss" | "listing_check" | "trip_planner" | "unmet_need";

const DAY = 24 * 60 * 60 * 1000;
const GLOBAL_COOLDOWN_DAYS = 3;
const ANSWERED_DAYS = 60;
const DISMISSED_DAYS = 14;
const SEARCH_MISS_COOLDOWN_DAYS = 1;

const SESSION_KEY = "fm.prompt.session.v1";
const LAST_SHOWN_KEY = "fm.prompt.lastShownAt.v1";
const promptKey = (id: PromptId) => `fm.prompt.${id}.v1`;

function get(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function set(storage: "local" | "session", key: string, value: string) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // Blocked storage just means the visitor may be asked again later.
  }
}

function within(timestamp: string | null, days: number): boolean {
  const at = Number(timestamp || 0);
  return at > 0 && Date.now() - at < days * DAY;
}

export function canShowPrompt(id: PromptId): boolean {
  if (typeof window === "undefined" || navigator.webdriver) return false;

  const record = get("local", promptKey(id));
  const [outcome, at] = (record ?? "").split(":");
  if (outcome === "answered" && within(at, ANSWERED_DAYS)) return false;
  if (outcome === "dismissed" && within(at, DISMISSED_DAYS)) return false;

  if (id === "search_miss") return !within(get("local", `${promptKey(id)}.shown`), SEARCH_MISS_COOLDOWN_DAYS);
  if (get("session", SESSION_KEY)) return false;
  return !within(get("local", LAST_SHOWN_KEY), GLOBAL_COOLDOWN_DAYS);
}

export function markPromptShown(id: PromptId) {
  const now = String(Date.now());
  if (id === "search_miss") {
    set("local", `${promptKey(id)}.shown`, now);
    return;
  }
  set("session", SESSION_KEY, id);
  set("local", LAST_SHOWN_KEY, now);
}

export function markPromptOutcome(id: PromptId, outcome: "answered" | "dismissed") {
  set("local", promptKey(id), `${outcome}:${Date.now()}`);
}

/*
 * The in-page question (src/components/PageQuestion.tsx) shares this budget so
 * it never feels like it is on every page:
 *
 * - It appears on one page per visit: the first one where it is scrolled to.
 * - Seeing it counts as the visit's one prompt, so no popup follows it.
 * - Closed with its X, it stays away DISMISSED_DAYS, like the popup.
 * - Scrolled past INLINE_MAX_IGNORED times without an answer, it rests for
 *   DISMISSED_DAYS before trying again.
 */
const INLINE_MAX_IGNORED = 3;
const INLINE_SESSION_KEY = "fm.pageq.session.v1";
const INLINE_SEEN_KEY = "fm.pageq.seen.v1";

function inlineSeen(): { count: number; at: string } {
  const [count, at] = (get("local", INLINE_SEEN_KEY) ?? "").split(":");
  return { count: Number(count) || 0, at: at ?? "" };
}

export function canShowInlineQuestion(path: string): boolean {
  if (typeof window === "undefined") return false;
  const [outcome, at] = (get("local", promptKey("unmet_need")) ?? "").split(":");
  if (outcome === "answered" && within(at, ANSWERED_DAYS)) return false;
  if (outcome === "dismissed" && within(at, DISMISSED_DAYS)) return false;

  const sessionPath = get("session", INLINE_SESSION_KEY);
  if (sessionPath) return sessionPath === path;
  // A popup already had this visit's one ask.
  if (get("session", SESSION_KEY)) return false;

  const seen = inlineSeen();
  return !(seen.count >= INLINE_MAX_IGNORED && within(seen.at, DISMISSED_DAYS));
}

/** Call when the in-page question first scrolls into view on a page. */
export function markInlineQuestionSeen(path: string) {
  if (get("session", INLINE_SESSION_KEY)) return;
  set("session", INLINE_SESSION_KEY, path);
  const seen = inlineSeen();
  const count = within(seen.at, DISMISSED_DAYS) && seen.count < INLINE_MAX_IGNORED ? seen.count + 1 : 1;
  set("local", INLINE_SEEN_KEY, `${count}:${Date.now()}`);
  markPromptShown("unmet_need");
}
