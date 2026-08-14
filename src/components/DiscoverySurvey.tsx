"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const STORAGE_KEY = "farmermarkets.discovery-survey.v1";

const surveyOptions = [
  { id: "farmers_market", label: "A farmers market" },
  { id: "public_food_market", label: "A public food market" },
  { id: "fresh_produce", label: "Fresh local produce" },
  { id: "prepared_food", label: "Prepared food or a hawker centre" },
  { id: "food_coop", label: "A food co-op or pickup point" },
  { id: "community_garden", label: "A community garden or urban farm" },
  { id: "other", label: "Something else" }
];

interface DiscoverySurveyProps {
  selectedCountry: string;
  resultCount: number;
}

export function DiscoverySurvey({ selectedCountry, resultCount }: DiscoverySurveyProps) {
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setHasAnswered(window.localStorage.getItem(STORAGE_KEY) === "answered");
    setIsReady(true);
  }, []);

  const submitResponse = (intent: string) => {
    trackEvent("Discovery Survey Response", {
      intent,
      country: selectedCountry,
      result_count: resultCount
    });
    window.localStorage.setItem(STORAGE_KEY, "answered");
    setHasAnswered(true);
  };

  if (!isReady) return null;

  return (
    <section className="w-full pb-8 sm:pb-12" aria-labelledby="discovery-survey-title">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
        <div className="rounded-2xl border border-green-200 bg-green-50/70 p-5 sm:p-6 dark:border-green-900 dark:bg-green-950/20">
          {hasAnswered ? (
            <div className="flex items-center gap-3 text-sm text-green-800 dark:text-green-300">
              <CheckCircle2 className="h-5 w-5" />
              <p>Thank you. Your answer will help us decide which market data to add next.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 id="discovery-survey-title" className="text-lg font-semibold">
                  What are you hoping to find today?
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  One click, no contact information. We use the aggregate answers to prioritize new data sources.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {surveyOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => submitResponse(option.id)}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 transition-colors hover:border-green-500 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-green-600 dark:hover:bg-green-950"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
