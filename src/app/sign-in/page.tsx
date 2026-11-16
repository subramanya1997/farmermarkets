import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/organizer';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { SignInForm } from '@/components/organizer/auth/SignInForm';
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

  return (
    <AuthShell
      title="Sign in"
      description="Sign in to manage your market listing."
      footer={
        <>
          <p>
            Run a market and new here?{' '}
            <Link href={withNext('/sign-up', next)} className={TEXT_LINK}>
              Create an organizer account
            </Link>
          </p>
          <p>
            Only want to suggest a correction?{' '}
            <Link href="/for-market-operators" className={TEXT_LINK}>
              Send us a note instead
            </Link>
          </p>
        </>
      }
    >
      <SignInForm
        next={next}
        forgotHref={withNext('/forgot-password', next)}
        verifyNotice={firstParam(params.verify) === '1'}
        linkFailed={verificationFailedIn(rawNext)}
      />
    </AuthShell>
  );
}
