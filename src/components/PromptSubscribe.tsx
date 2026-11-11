"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { trackEvent } from "@/lib/analytics";

interface PromptSubscribeProps {
  /** City to name in the pitch; "you" when the page has none. */
  place?: string;
  /** Where this ask sits, reported on the shown and submitted events. */
  placement: "prompt" | "after_action" | "after_answer" | "after_answer_inline";
  onSubscribed: () => void;
}

/**
 * The one-line newsletter ask used inside visitor prompts and after the
 * in-page question. Email only: the larger NewsletterSignup boxes ask for a
 * ZIP, this one is meant to be answered in a single tap and a few keys.
 */
export function PromptSubscribe({ place, placement, onSubscribed }: PromptSubscribeProps) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("Newsletter Ask Shown", { placement });
  }, [placement]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
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
      trackEvent("Newsletter Signup Submitted", { source: "prompt", placement, has_zip: false });
      onSubscribed();
    } catch (caught) {
      setBusy(false);
      setError((caught as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
        Market days near {place ?? "you"} and what&apos;s in season, at most once a week.
      </p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={inputId}>Email address</label>
        <input
          id={inputId}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-green-800 active:scale-[0.98] disabled:opacity-70"
        >
          {busy ? "Sending" : "Subscribe"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
