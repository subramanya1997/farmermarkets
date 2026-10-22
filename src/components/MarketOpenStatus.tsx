"use client";

import { useEffect, useState } from "react";
import { computeOpenStatus, type OpenStatus, type OpenStatusInput } from "@/lib/openStatus";

/**
 * Live open/closed line for the "Plan your visit" summary. Renders nothing on
 * the server and until the visitor's clock is known, so the static HTML never
 * carries a status that was true only when the page was built.
 */
export function MarketOpenStatus({ input }: { input: OpenStatusInput }) {
  const [status, setStatus] = useState<OpenStatus | undefined>();

  useEffect(() => {
    const update = () => setStatus(computeOpenStatus(input));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [input]);

  if (!status) return null;
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200" aria-live="polite">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${status.open ? "bg-green-600" : "bg-zinc-400"}`}
      />
      {status.text}
    </p>
  );
}
