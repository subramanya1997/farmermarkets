"use client";

import { OPEN_FEEDBACK_EVENT } from "@/components/DiscoverySurvey";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Footer link that opens the feedback form (DiscoverySurvey) on request. */
export function FeedbackLink({ className }: { className?: string }) {
  return (
    <Button
      type="button"
      variant="link"
      onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))}
      // Reads as a plain footer link: no button padding, height, weight or hover underline.
      className={cn("h-auto p-0 font-normal transition-none hover:no-underline", className)}
    >
      Send feedback
    </Button>
  );
}
