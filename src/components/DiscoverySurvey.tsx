"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2, Store } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Dispatch this on `window` to open the feedback form. It never opens by
 * itself: the footer's "Send feedback" link is the only way in. Contextual
 * questions live in src/components/VisitorPrompts.tsx.
 */
export const OPEN_FEEDBACK_EVENT = "fm:open-feedback";

const MESSAGE_LIMIT = 1200;

/**
 * The "Send feedback" dialog: one message field and an optional email.
 *
 * Posts to `/api/discovery` (Resend email to the team inbox, nothing stored)
 * with the fields that endpoint's schema requires filled with neutral values:
 * intent "other", no help topics, and the page path in `country` so the
 * email says where the visitor was. Giving an email is the request for a
 * reply, so it doubles as `contactPermission`. Listing requests go to
 * /for-market-operators, whose form also records them for review.
 */
export function DiscoverySurvey() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const open = () => {
      setIsOpen(true);
      setSent(false);
      setError("");
      trackEvent("Feedback Opened", { trigger: "feedback_link" });
    };
    window.addEventListener(OPEN_FEEDBACK_EVENT, open);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, open);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");

    const text = message.trim();
    const replyTo = email.trim();
    if (!text) {
      setError("Write a few words first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "other",
          helpTopics: [],
          name: "",
          organization: "",
          email: replyTo,
          phone: "",
          message: text,
          contactPermission: Boolean(replyTo),
          country: `Feedback from ${pathname || "/"}`.slice(0, 100),
          resultCount: 0,
          website,
        }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error || "Your feedback could not be sent. Please try again.");
      }

      setSent(true);
      setMessage("");
      trackEvent("Feedback Sent", { has_email: Boolean(replyTo) });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Your feedback could not be sent. Please try again."
      );
      trackEvent("Feedback Failed", { has_email: Boolean(replyTo) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-700" aria-hidden="true" />
            <DialogTitle className="text-lg">Thanks, it&apos;s sent</DialogTitle>
            <DialogDescription>
              {email.trim() ? "We'll reply by email if there's anything to follow up." : "We read every message."}
            </DialogDescription>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-2 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Send feedback</DialogTitle>
              <DialogDescription>What&apos;s working, what&apos;s missing, or what&apos;s wrong.</DialogDescription>
            </DialogHeader>

            <label className="block">
              <span className="sr-only">Your feedback</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={MESSAGE_LIMIT}
                rows={4}
                required
                autoFocus
                className="w-full resize-none rounded-xl border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-zinc-700"
              />
            </label>

            <label className="block space-y-1 text-sm font-medium">
              Email <span className="font-normal text-zinc-500">(optional, for a reply)</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>

            <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
            </div>

            <Link
              href="/for-market-operators"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 transition-colors hover:border-green-600/40 hover:bg-green-50/60 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-green-900/20"
            >
              <Store aria-hidden="true" className="h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
              Adding or fixing a market listing? Use the market operators page.
            </Link>

            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Sent privately to our team, not to analytics.{" "}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-green-700">
                  Privacy
                </Link>
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {isSubmitting ? "Sending" : "Send"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
