'use client';

/**
 * Follow a vendor from the stall QR page with as little as possible: a
 * signed-in shopper taps once; anyone else types an email, then the 6 digit
 * code we send (the same Better Auth email code as organizer sign-in), and
 * the follow happens as soon as the code checks out.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Heart, Loader2 } from 'lucide-react';
import { followVendorAction, unfollowVendorAction } from '@/app/(site)/v/[slug]/actions';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NETWORK_MESSAGE, RATE_LIMIT_MESSAGE, isRateLimited, looksLikeEmail } from '@/components/organizer/auth/FormBits';

const CODE_LENGTH = 6;

const PRIMARY = 'h-12 w-full bg-green-700 text-base text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700';

export interface FollowVendorCardProps {
  slug: string;
  name: string;
  signedIn: boolean;
  following: boolean;
  own: boolean;
}

export function FollowVendorCard({ slug, name, signedIn, following: initiallyFollowing, own }: FollowVendorCardProps) {
  const router = useRouter();
  const [following, setFollowing] = useState(initiallyFollowing);
  const [step, setStep] = useState<'start' | 'code'>('start');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);
  const working = busy || pending;

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  function follow() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await followVendorAction(slug);
        if (result.ok) {
          setFollowing(true);
          router.refresh();
        } else setError(result.error);
      } catch {
        setError(NETWORK_MESSAGE);
      }
    });
  }

  function unfollow() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unfollowVendorAction(slug);
        if (result.ok) setFollowing(false);
        else setError(result.error);
      } catch {
        setError(NETWORK_MESSAGE);
      }
    });
  }

  async function sendCode() {
    setError(null);
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setError(address ? 'That email does not look right.' : 'Enter your email.');
      return;
    }
    setBusy(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' });
      if (sendError) {
        setError(isRateLimited(sendError) ? RATE_LIMIT_MESSAGE : 'We could not send a code. Try again in a moment.');
        return;
      }
      setCode('');
      setStep('code');
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function verify(entered: string) {
    setError(null);
    const digits = entered.replace(/\D/g, '');
    if (digits.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH} digit code from the email.`);
      return;
    }
    setBusy(true);
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({ email: email.trim(), otp: digits });
      if (signInError) {
        if (isRateLimited(signInError)) setError(RATE_LIMIT_MESSAGE);
        else if (signInError.code === 'OTP_EXPIRED') setError('That code has expired. Send a new one.');
        else if (signInError.code === 'TOO_MANY_ATTEMPTS') setError('Too many wrong tries. Send a new code.');
        else setError('That code is not right. Check the email and try again.');
        return;
      }
      follow();
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  if (own) return null;

  return (
    <section aria-labelledby="follow-heading" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      {following ? (
        <div className="flex flex-col gap-3">
          <h2 id="follow-heading" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-green-900 dark:text-green-100">
            <Check aria-hidden="true" className="size-5 text-green-700 dark:text-green-400" />
            You follow {name}
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">They see that one more shopper follows them. They never see your email.</p>
          <Button type="button" variant="outline" disabled={working} onClick={unfollow} className="h-11 self-start">
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Unfollow
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 id="follow-heading" className="text-lg font-semibold tracking-tight">
            Follow {name}
          </h2>
          {signedIn ? (
            <Button type="button" disabled={working} onClick={follow} className={PRIMARY}>
              {working ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Heart aria-hidden="true" />}
              Follow
            </Button>
          ) : step === 'start' ? (
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!working) void sendCode();
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="follow-email">Email</Label>
                <Input
                  id="follow-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  value={email}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  className="h-12 text-base"
                />
              </div>
              <Button type="submit" disabled={working} className={PRIMARY}>
                {working ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Heart aria-hidden="true" />}
                {working ? 'Sending code' : 'Follow'}
              </Button>
            </form>
          ) : (
            <form
              noValidate
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!working) void verify(code);
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="follow-code">Code sent to {email.trim()}</Label>
                <Input
                  ref={codeRef}
                  id="follow-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={CODE_LENGTH + 2}
                  value={code}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\d ]/g, '');
                    setCode(next);
                    setError(null);
                    if (!working && next.replace(/\D/g, '').length === CODE_LENGTH) void verify(next);
                  }}
                  className="h-12 text-center font-mono text-xl tracking-[0.4em]"
                />
              </div>
              <Button type="submit" disabled={working} className={PRIMARY}>
                {working ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Heart aria-hidden="true" />}
                {working ? 'Checking' : 'Confirm and follow'}
              </Button>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <Button type="button" variant="link" disabled={working} onClick={() => setStep('start')} className="h-auto p-0 text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
                  Use a different email
                </Button>
                <Button type="button" variant="link" disabled={working} onClick={() => void sendCode()} className="h-auto p-0 text-green-700 underline underline-offset-2 dark:text-green-400">
                  Send a new code
                </Button>
              </div>
            </form>
          )}
          {error ? (
            <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {signedIn
              ? `${name} sees how many people follow, never who.`
              : `We email you a code to check it is you, which also sets up a free account. No password. ${name} sees how many people follow, never who. We do not send you anything else.`}
          </p>
        </div>
      )}
    </section>
  );
}
