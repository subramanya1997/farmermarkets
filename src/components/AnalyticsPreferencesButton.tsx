"use client";

import { openAnalyticsPreferences } from "@/lib/analytics";

export function AnalyticsPreferencesButton() {
  return (
    <button
      type="button"
      onClick={openAnalyticsPreferences}
      className="text-sm text-zinc-600 hover:text-green-600 dark:text-zinc-400 dark:hover:text-green-500"
    >
      Analytics settings
    </button>
  );
}
