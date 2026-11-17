import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/organizer';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { SignInForm } from '@/components/organizer/auth/SignInForm';
import { EmailCodeForm } from '@/components/organizer/auth/EmailCodeForm';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { firstParam, safeNext, verificationFailedIn, withNext } from '@/components/organizer/auth/nextPath';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawNext = firstParam(params.next);
  const next = safeNext(rawNext);

  const user = await getSessionUser();
  if (user?.emailVerified) redirect(next);

  // An emailed code is the default; a password is there for accounts that
  // set one. Confirmation-link notices only concern password accounts.
  const verifyNotice = firstParam(params.verify) === '1';
  const linkFailed = verificationFailedIn(rawNext);
  const usePassword = firstParam(params.method) === 'password' || verifyNotice || linkFailed;
  const switchHref = (method?: 'password') => {
    const query = new URLSearchParams({ ...(method ? { method } : {}), next });
    return `/sign-in?${query.toString()}`;
  };

  // Vendors arrive with `next` inside the vendor area; the page speaks to them.
  const vendor = next === '/vendor' || next.startsWith('/vendor/') || next.startsWith('/vendor?');

  return (
    <AuthShell
      title="Sign in"
      description={
        vendor
          ? 'Sign in to set up your vendor page and pick your markets. New vendors get an account with their first code.'
          : 'Sign in to manage your market listing. New organizers get an account with their first code.'
      }
      footer={
        <>
          <p>
            {usePassword ? (
              <>
                No password?{' '}
                <Link href={switchHref()} className={TEXT_LINK}>
                  Email me a sign-in code
                </Link>
              </>
            ) : (
              <>
                Set a password before?{' '}
                <Link href={switchHref('password')} className={TEXT_LINK}>
                  Sign in with your password
                </Link>
              </>
            )}
          </p>
          {usePassword && !vendor ? (
            <p>
              Run a market and new here?{' '}
              <Link href={withNext('/sign-up', next)} className={TEXT_LINK}>
                Create an organizer account
              </Link>
            </p>
          ) : null}
          {vendor ? (
            <p>
              Not sure what this is?{' '}
              <Link href="/for-vendors" className={TEXT_LINK}>
                How vendor pages work
              </Link>
            </p>
          ) : (
            <p>
              Only want to suggest a correction?{' '}
              <Link href="/for-market-operators" className={TEXT_LINK}>
                Send us a note instead
              </Link>
            </p>
          )}
        </>
      }
    >
      {usePassword ? (
        <SignInForm
          next={next}
          forgotHref={withNext('/forgot-password', next)}
          verifyNotice={verifyNotice}
          linkFailed={linkFailed}
        />
      ) : (
        <EmailCodeForm next={next} surface="sign_in" />
      )}
    </AuthShell>
  );
}
