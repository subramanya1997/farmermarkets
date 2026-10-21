"use client";

import { OPEN_FEEDBACK_EVENT } from "@/components/DiscoverySurvey";

/** Footer link that opens the feedback form (DiscoverySurvey) on request. */
export function FeedbackLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))} className={className}>
      Send feedback
    </button>
  );
}
