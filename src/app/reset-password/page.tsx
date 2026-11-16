import type { Metadata } from 'next';
import { AuthShell } from '@/components/organizer/auth/AuthShell';
import { ResetLinkExpired, ResetPasswordForm } from '@/components/organizer/auth/ResetPasswordForm';
import { firstParam, safeNext, withNext } from '@/components/organizer/auth/nextPath';

export const metadata: Metadata = {
  title: 'Reset password',
  // The emailed link carries a one-time token in the query string; keep it
  // out of Referer headers sent to anything this page links to.
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(firstParam(params.next));
  const token = firstParam(params.token)?.trim();
  const forgotHref = withNext('/forgot-password', next);
  const usable = Boolean(token && /^[A-Za-z0-9_-]{8,200}$/.test(token) && !firstParam(params.error));

  return (
    <AuthShell title="Choose a new password">
      {usable && token ? (
        <ResetPasswordForm token={token} signInHref={withNext('/sign-in', next)} forgotHref={forgotHref} />
      ) : (
        <ResetLinkExpired forgotHref={forgotHref} />
      )}
    </AuthShell>
  );
}
