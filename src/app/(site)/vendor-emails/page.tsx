import type { Metadata } from 'next';
import Link from 'next/link';
import { firstParam } from '@/components/organizer/auth/nextPath';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SITE_FRAME } from '@/lib/ui';
import { stopVendorEmailsAction } from './actions';

export const metadata: Metadata = {
  title: 'Vendor emails',
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

/**
 * Where the "Stop these emails" link in a vendor announcement lands. With
 * `?token=` it asks first; the button runs `stopVendorEmailsAction`, which
 * sends people back with `?status=stopped`, or
 * `?status=unavailable` when the database could not be reached.
 */
export default async function VendorEmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = firstParam(params.status);
  const stopped = status === 'stopped';
  const rawToken = firstParam(params.token) ?? '';
  // The link in the email lands here first: nothing happens until the button is pressed.
  const token = !status && /^[A-Za-z0-9_-]{20,100}$/.test(rawToken) ? rawToken : null;

  if (token) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 sm:py-14 dark:from-green-900/20 dark:to-zinc-950">
          <div className={SITE_FRAME}>
            <div className="mx-auto max-w-xl">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stop announcement emails?</h1>
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                You will still get emails about your own profile, applications and documents. You can turn announcements
                back on in your vendor settings.
              </p>
              {/* A server action carries the token, so the page has no hidden field and still works without JavaScript. */}
              <form action={stopVendorEmailsAction.bind(null, token)} className="mt-6">
                <Button type="submit" className="h-11 w-full rounded-full bg-green-700 px-5 text-white hover:bg-green-800 sm:w-auto">
                  Stop these emails
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 sm:py-14 dark:from-green-900/20 dark:to-zinc-950">
        <div className={SITE_FRAME}>
          <div className="mx-auto max-w-xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {stopped ? 'Emails stopped' : 'That did not work'}
            </h1>
            {stopped ? (
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                You will not get announcement emails from Farmer Markets any more. You can turn them back on in
                your{' '}
                <Link
                  href="/vendor"
                  rel="nofollow"
                  className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                >
                  vendor settings
                </Link>
                .
              </p>
            ) : (
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">
                We could not stop your emails just now. Please open the link in the email again in a few minutes.
              </p>
            )}
            <p className="mt-6">
              <Link href="/" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 rounded-full border-green-600 px-4 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950')}>
                Farmer Markets home
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
