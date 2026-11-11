"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, MessageCircleQuestion, X } from "lucide-react";
import { posthogRequestHeaders, trackEvent } from "@/lib/analytics";
import { newsletterAskVariant } from "@/lib/experiments";
import { canShowInlineQuestion, markInlineQuestionSeen, markPromptOutcome } from "@/lib/promptBudget";
import { CITY_NEEDS, MARKET_NEEDS, type VisitorNeed } from "@/lib/visitorNeeds";
import { PromptSubscribe } from "./PromptSubscribe";

interface PageQuestionProps {
  kind: "market" | "city";
  /** City name, for the newsletter offer that can follow an answer. */
  place?: string;
  marketSlug?: string;
}

type Step = "ask" | "detail" | "subscribe" | "done";

/**
 * "What were you hoping to find?", asked in the page itself.
 *
 * The popup version (VisitorPrompts) only reaches a visitor who reads for a
 * while and may show once per visit; it was answered about once in ten
 * showings but shown to very few people. This one sits in the page for
 * whoever scrolls to it, on one page per visit (rules in promptBudget.ts),
 * and reports the same events with
 * `trigger: "inline"` / `surface: "inline"`, so the two can be compared. It
 * hides once the question has been answered in either place.
 */
export function PageQuestion({ kind, place, marketSlug }: PageQuestionProps) {
  const rootRef = useRef<HTMLElement>(null);
  const touched = useRef(false);
  // Hidden until the budget says this visit may be asked here.
  const [hidden, setHidden] = useState(true);
  const [step, setStep] = useState<Step>("ask");
  const [need, setNeed] = useState<VisitorNeed | null>(null);
  const [note, setNote] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const needs = kind === "market" ? MARKET_NEEDS : CITY_NEEDS;

  // Read after hydration: the server cannot know what this browser has seen.
  // A background tab runs this late, so never hide it from under someone who
  // has already started answering here.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!touched.current) setHidden(!canShowInlineQuestion(window.location.pathname));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Report the first time it is seen, and keep `data-in-view` current so the
  // popup does not ask the same question on top of it.
  useEffect(() => {
    const node = rootRef.current;
    if (!node || hidden || typeof IntersectionObserver === "undefined") return;
    let reported = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        node.dataset.inView = String(entry.isIntersecting);
        if (entry.isIntersecting && !reported && !navigator.webdriver) {
          reported = true;
          markInlineQuestionSeen(window.location.pathname);
          trackEvent("Prompt Shown", { prompt: "unmet_need", trigger: "inline" });
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hidden]);

  if (hidden) return null;

  const afterAnswer = () => setStep(newsletterAskVariant() === "after_answer" ? "subscribe" : "done");

  const answer = (value: string, extra: Record<string, string> = {}) => {
    markPromptOutcome("unmet_need", "answered");
    trackEvent("Prompt Answered", { prompt: "unmet_need", answer: value, surface: "inline", ...extra });
  };

  const dismiss = () => {
    markPromptOutcome("unmet_need", "dismissed");
    trackEvent("Prompt Dismissed", { prompt: "unmet_need", surface: "inline" });
    setHidden(true);
  };

  const choose = (chosen: VisitorNeed) => {
    touched.current = true;
    setNeed(chosen);
    if (chosen.id === "other") return setStep("detail");
    // The chip is the answer; the follow-up only adds detail to it.
    answer(chosen.id);
    if (chosen.followUp) return setStep("detail");
    afterAnswer();
  };

  const sendDetail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = note.trim().slice(0, 500);
    if (need?.id === "other") answer("other", { has_note: text ? "yes" : "no" });
    if (text) {
      void fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...posthogRequestHeaders() },
        body: JSON.stringify({
          type: "contact",
          ...(marketSlug ? { market_slug: marketSlug } : {}),
          payload: { source: "unmet_need", surface: "inline", need: need?.id, page_path: window.location.pathname, note: text },
        }),
      }).catch(() => {
        // The analytics event already recorded the answer.
      });
    }
    afterAnswer();
  };

  return (
    <section
      ref={rootRef}
      data-page-question=""
      aria-labelledby="page-question-heading"
      className="relative rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {step === "ask" && (
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
          <span className="sr-only">Hide this question</span>
        </button>
      )}
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/30">
          <MessageCircleQuestion aria-hidden="true" className="h-4 w-4 text-green-700 dark:text-green-400" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="page-question-heading" className="font-semibold text-zinc-900 dark:text-zinc-50">
            {step === "detail" && need?.followUp
              ? need.followUp
              : step === "subscribe" || step === "done"
                ? "Thanks, noted"
                : "What were you hoping to find?"}
          </h2>

          {step === "ask" && (
            <>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                One tap tells us what to add to this page next.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {needs.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choose(option)}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-zinc-800 transition-[border-color,background-color,transform] hover:border-green-600/50 hover:bg-green-50 active:scale-[0.98] dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-green-900/20"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === "detail" && (
            <form onSubmit={sendDetail} className="mt-3">
              <label className="sr-only" htmlFor="page-question-note">
                {need?.followUp ?? "Tell us in a few words"}
              </label>
              <textarea
                id="page-question-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder={need?.followUp ? "For example: eggs, tomatoes, a bakery" : "Tell us in a few words"}
                className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button
                type="submit"
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-green-700 px-4 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-green-800 active:scale-[0.98]"
              >
                {note.trim() ? "Send" : "Skip"}
              </button>
            </form>
          )}

          {step === "subscribe" && (
            <div className="mt-2">
              <p className="mb-1 text-sm font-medium text-green-800 dark:text-green-300">
                Want to hear when it&apos;s market day?
              </p>
              <PromptSubscribe place={place} placement="after_answer_inline" onSubscribed={() => { setSubscribed(true); setStep("done"); }} />
            </div>
          )}

          {step === "done" && (
            <p role="status" className="prompt-done mt-2 flex items-center gap-2 text-sm font-medium text-green-800 dark:text-green-300">
              <Check aria-hidden="true" className="h-4 w-4" />
              {subscribed ? "Check your inbox for a confirmation link." : "Thanks. We read every answer."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
