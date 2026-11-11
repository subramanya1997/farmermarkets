"use client";

import posthog from "posthog-js";

/**
 * Newsletter ask experiment (`newsletter_ask_v1`), started Nov 2026 after a
 * month with no signups: the in-page boxes were being scrolled past and the
 * "trip planner" popup needed three market views, which search visitors
 * almost never reach.
 *
 * Each browser is put in one arm, once, and keeps it:
 *
 * - control: the in-page signup boxes only, plus the three-market popup.
 * - after_action: after a Website / Directions / Phone tap, the popup offers
 *   the newsletter instead of asking whether the listing was right.
 * - after_answer: answering "What were you hoping to find?" is followed by
 *   the newsletter offer.
 *
 * The arm is registered with PostHog as `exp_newsletter_ask`, so every event
 * carries it. Compare arms on "Newsletter Signup Submitted" per visitor; the
 * "Newsletter Ask Shown" event (with `placement`) says how often each ask was
 * actually seen. Automated browsers are never assigned.
 */

export const NEWSLETTER_ASK_VARIANTS = ["control", "after_action", "after_answer"] as const;
export type NewsletterAskVariant = (typeof NEWSLETTER_ASK_VARIANTS)[number];

const STORAGE_KEY = "fm.exp.newsletter_ask.v1";
const PROPERTY = "exp_newsletter_ask";

let cached: NewsletterAskVariant | null = null;

function isVariant(value: unknown): value is NewsletterAskVariant {
  return NEWSLETTER_ASK_VARIANTS.includes(value as NewsletterAskVariant);
}

export function newsletterAskVariant(): NewsletterAskVariant {
  if (typeof window === "undefined" || navigator.webdriver) return "control";
  if (cached) return cached;

  let variant: NewsletterAskVariant | null = null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isVariant(stored)) variant = stored;
  } catch {
    // Storage blocked: the arm lasts for this page only.
  }
  if (!variant) {
    variant = NEWSLETTER_ASK_VARIANTS[Math.floor(Math.random() * NEWSLETTER_ASK_VARIANTS.length)];
    try {
      window.localStorage.setItem(STORAGE_KEY, variant);
    } catch {
      // Best effort only.
    }
  }

  cached = variant;
  if (posthog.__loaded) posthog.register({ [PROPERTY]: variant });
  return variant;
}
