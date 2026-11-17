'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * Error boundary for the market detail route.
 *
 * A data-load failure must never render as a 200 "everything is fine" page:
 * the page component lets the error propagate here, so the server responds
 * with a 500 and crawlers see a transient failure instead of a soft 404.
 */
export default function MarketDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Error rendering market detail page:', error);
  }, [error]);

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="text-2xl font-bold text-red-600 mb-4">Market Information Unavailable</h1>
      <p className="text-center max-w-md mb-6">
        We&apos;re experiencing some technical difficulties fetching the market details.
        Please try again in a few moments.
      </p>
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => reset()}>
          Try Again
        </Button>
        <Link href="/markets">
          <Button variant="outline">Back to Markets</Button>
        </Link>
        <Link href="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
