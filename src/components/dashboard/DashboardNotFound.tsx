import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * What a dashboard page shows after `notFound()` (a market you do not manage,
 * a review that is gone). It renders inside the dashboard shell, so the
 * sidebar stays and the way back is one click.
 */
export function DashboardNotFound({ href, label }: { href: string; label: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <meta name="robots" content="noindex, nofollow" />
      <h1 className="text-2xl font-bold tracking-tight">Nothing here</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        This page does not exist, or it is not one you can open with this account.
      </p>
      <Button asChild className="mt-6 bg-green-700 hover:bg-green-800">
        <Link href={href}>{label}</Link>
      </Button>
    </div>
  );
}
