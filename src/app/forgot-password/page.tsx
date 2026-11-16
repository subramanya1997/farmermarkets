import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/organizer/auth/ForgotPasswordForm';
import { TEXT_LINK } from '@/components/organizer/auth/FormBits';
import { firstParam, safeNext, withNext } from '@/components/organizer/auth/nextPath';

export const metadata: Metadata = {
  title: 'Forgot password',
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(firstParam(params.next));
  const signInHref = withNext('/sign-in', next);

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter the email you signed up with and we will send you a link to choose a new password."
      footer={
        <p>
          Remembered it?{' '}
          <Link href={signInHref} className={TEXT_LINK}>
            Sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm resetPath={withNext('/reset-password', next)} signInHref={signInHref} />
    </AuthShell>
  );
}
