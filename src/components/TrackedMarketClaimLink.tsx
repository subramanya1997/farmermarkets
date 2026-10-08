"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface TrackedMarketClaimLinkProps {
  marketId: string;
  marketSlug: string;
}

export function TrackedMarketClaimLink({
  marketId,
  marketSlug,
}: TrackedMarketClaimLinkProps) {
  return (
    <Link
      href={`/for-market-operators?market=${marketSlug}`}
      onClick={() => trackEvent("listing_claim_started", { market_id: marketId })}
      className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
    >
      Claim and update this listing
    </Link>
  );
}
