"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const STORAGE_KEY = "farmermarkets.discovery-survey.v2";
const SESSION_DISMISSED_KEY = "farmermarkets.discovery-survey-dismissed.v1";

const surveyOptions = [
  { id: "farmers_market", label: "A farmers market" },
  { id: "public_food_market", label: "A public food market" },
  { id: "fresh_produce", label: "Fresh local produce" },
  { id: "prepared_food", label: "Prepared food or a hawker centre" },
  { id: "food_coop", label: "A food co-op or pickup point" },
  { id: "community_garden", label: "A community garden or urban farm" },
  { id: "other", label: "Something else" }
] as const;

const helpOptions = [
  { id: "get_listed", label: "Get a market or local-food place listed" },
  { id: "update_listing", label: "Update or correct a listing" },
  { id: "coverage_request", label: "Request coverage for another area" },
  { id: "operations", label: "Improve operations or workflows" },
  { id: "data_partnership", label: "Share data or discuss a partnership" },
  { id: "other", label: "Something else" }
] as const;

interface DiscoverySurveyProps {
  selectedCountry: string;
  resultCount: number;
}

export function DiscoverySurvey({ selectedCountry, resultCount }: DiscoverySurveyProps) {
  const initialContext = useRef({ selectedCountry, resultCount });
  const [isOpen, setIsOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [intent, setIntent] = useState("");
  const [helpTopics, setHelpTopics] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [contactPermission, setContactPermission] = useState(false);
  const [website, setWebsite] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const submitted = window.localStorage.getItem(STORAGE_KEY) === "submitted";
    const dismissedThisSession = window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === "dismissed";
    if (submitted || dismissedThisSession) return;

    const timeout = window.setTimeout(() => {
      setIsOpen(true);
      trackEvent("Discovery Popup Opened", {
        country: initialContext.current.selectedCountry,
        result_count: initialContext.current.resultCount
      });
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, []);

  const updateOpen = (open: boolean) => {
    setIsOpen(open);
    if (!open && !hasSubmitted) {
      window.sessionStorage.setItem(SESSION_DISMISSED_KEY, "dismissed");
      trackEvent("Discovery Popup Dismissed", {
        selected_intent: Boolean(intent),
        country: selectedCountry
      });
    }
  };

  const toggleHelpTopic = (topic: string) => {
    setHelpTopics((current) => (
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic]
    ));
  };

  const submitResponse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (step === 1) {
      if (!intent) {
        setError("Choose what you are hoping to find.");
        return;
      }
      setStep(2);
      return;
    }

    if (!intent) {
      setError("Choose what you are hoping to find.");
      return;
    }

    const hasContactDetails = Boolean(email.trim() || phone.trim());
    if (hasContactDetails && !contactPermission) {
      setError("Please confirm that we may contact you, or remove your contact details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          helpTopics,
          name: name.trim(),
          organization: organization.trim(),
          email: email.trim(),
          phone: phone.trim(),
          message: message.trim(),
          contactPermission,
          country: selectedCountry,
          resultCount,
          website
        })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error || "We could not send your request. Please try again.");
      }

      window.localStorage.setItem(STORAGE_KEY, "submitted");
      setHasSubmitted(true);
      trackEvent("Discovery Survey Response", {
        intent,
        country: selectedCountry,
        result_count: resultCount,
        help_topic_count: helpTopics.length,
        primary_help_topic: helpTopics[0] || "none",
        has_email: Boolean(email.trim()),
        has_phone: Boolean(phone.trim()),
        requested_contact: contactPermission
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not send your request. Please try again.");
      trackEvent("Discovery Survey Submission Failed", {
        intent,
        country: selectedCountry,
        has_email: Boolean(email.trim()),
        has_phone: Boolean(phone.trim())
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={updateOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {hasSubmitted ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600" aria-hidden="true" />
            <div>
              <DialogTitle className="text-xl">Thank you</DialogTitle>
              <DialogDescription className="mt-2 max-w-md">
                Your request was sent. If you shared contact details, we can follow up about listings, updates, operations, or other ways to help.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submitResponse} className="space-y-5">
            <DialogHeader>
              <DialogTitle>What can we help you find or improve?</DialogTitle>
              <DialogDescription>
                {step === 1
                  ? "Tell us what brought you here."
                  : "Contact details are optional and are only used if you want us to follow up."}
              </DialogDescription>
            </DialogHeader>

            {step === 1 ? <><fieldset className="space-y-2">
              <legend className="text-sm font-semibold">What are you hoping to find? *</legend>
              <div className="flex flex-wrap gap-2">
                {surveyOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={intent === option.id}
                    onClick={() => setIntent(option.id)}
                    className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                      intent === option.id
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-zinc-300 bg-white text-zinc-800 hover:border-green-500 hover:bg-green-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-green-950"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Would any of these help?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {helpOptions.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-200 p-3 text-sm hover:border-green-400 dark:border-zinc-800">
                    <input
                      type="checkbox"
                      checked={helpTopics.includes(option.id)}
                      onChange={() => toggleHelpTopic(option.id)}
                      className="mt-0.5 h-4 w-4 accent-green-600"
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset></> : <>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                Name <span className="font-normal text-zinc-500">(optional)</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoComplete="name" />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Organization <span className="font-normal text-zinc-500">(optional)</span>
                <Input value={organization} onChange={(event) => setOrganization(event.target.value)} maxLength={120} autoComplete="organization" />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Email <span className="font-normal text-zinc-500">(optional)</span>
                <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="you@example.com" />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Phone <span className="font-normal text-zinc-500">(optional)</span>
                <Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} autoComplete="tel" placeholder="+1 555 123 4567" />
              </label>
            </div>

            <label className="block space-y-1 text-sm font-medium">
              How can we help? <span className="font-normal text-zinc-500">(optional)</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1200}
                rows={3}
                className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700"
                placeholder="Tell us about a listing, data gap, operational challenge, or partnership."
              />
            </label>

            <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
            </div>

            {(email.trim() || phone.trim()) ? (
              <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={contactPermission}
                  onChange={(event) => setContactPermission(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-green-600"
                />
                <span>You may contact me about this request using the details I provided.</span>
              </label>
            ) : null}

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Contact details and your message are sent privately by email and are not included in Google or Vercel Analytics. See our{" "}
              <Link href="/privacy" className="underline hover:text-green-700">privacy policy</Link>.
            </p>
            </>}

            {error ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            ) : null}

            {step === 1 ? (
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => updateOpen(false)}
                  className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Maybe later
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    if (!intent) {
                      setError("Choose what you are hoping to find.");
                      return;
                    }
                    setError("");
                    setStep(2);
                  }}
                  className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Continue
                </button>
              </DialogFooter>
            ) : (
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setStep(1);
                  }}
                  className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {isSubmitting ? "Sending…" : "Send request"}
                </button>
              </DialogFooter>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
