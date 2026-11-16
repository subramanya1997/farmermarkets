import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/organizer';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { SignUpForm } from '@/components/organizer/auth/SignUpForm';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { firstParam, safeNext, withNext } from '@/components/organizer/auth/nextPath';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an organizer account',
  robots: { index: false, follow: false },
};

export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(firstParam(params.next));

  const user = await getSessionUser();
  if (user?.emailVerified) redirect(next);

  const signInHref = withNext('/sign-in', next);

  return (
    <AuthShell
      title="Create an organizer account"
      description="For people who run a farmers market. Claim your listing, then keep its hours, location and photos up to date. It is free."
      footer={
        <p>
          Already have an account?{' '}
          <Link href={signInHref} className={TEXT_LINK}>
            Sign in
          </Link>
        </p>
      }
    >
      <SignUpForm next={next} signInHref={signInHref} />
    </AuthShell>
  );
}
