'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckInbox } from './CheckInbox';
import {
  Field,
  FormAlert,
  NETWORK_MESSAGE,
  PasswordInput,
  RATE_LIMIT_MESSAGE,
  SubmitButton,
  TEXT_LINK,
  fieldA11y,
  isRateLimited,
  looksLikeEmail,
  useFieldIds,
} from './FormBits';

type FieldName = 'email' | 'password';
type Errors = Partial<Record<FieldName, string>>;

interface SignInFormProps {
  /** Validated same-site path to go to after signing in. */
  next: string;
  forgotHref: string;
  /** `?verify=1`: the organizer was sent here because their email is not confirmed yet. */
  verifyNotice?: boolean;
  /** A confirmation link failed (expired or already used) on the way here. */
  linkFailed?: boolean;
}

type ResendState = 'idle' | 'sending' | 'sent' | 'limited' | 'failed';

export function SignInForm({ next, forgotHref, verifyNotice, linkFailed }: SignInFormProps) {
  const router = useRouter();
  const ids = useFieldIds(['email', 'password'] as const);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resend, setResend] = useState<ResendState>('idle');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found: Errors = {};
    if (!email.trim()) found.email = 'Enter your email address.';
    else if (!looksLikeEmail(email)) found.email = 'That email address does not look right.';
    if (!password) found.password = 'Enter your password.';
    setErrors(found);
    if (found.email || found.password) {
      document.getElementById(found.email ? ids.email : ids.password)?.focus();
      return;
    }

    setPending(true);
    let navigating = false;
    try {
      const { error } = await authClient.signIn.email({ email: email.trim(), password, callbackURL: next });
      if (error) {
        if (error.status === 403 || error.code === 'EMAIL_NOT_VERIFIED') {
          // The server has already emailed a fresh confirmation link.
          setUnverifiedEmail(email.trim());
        } else if (isRateLimited(error)) {
          setFormError(RATE_LIMIT_MESSAGE);
        } else if (error.status === 401 || error.code === 'INVALID_EMAIL_OR_PASSWORD') {
          setFormError('That email and password do not match. Check them, or reset your password.');
        } else {
          setFormError('We could not sign you in. Try again in a moment.');
        }
        return;
      }
      navigating = true;
      router.push(next);
      router.refresh();
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      // Keep the button in its pending state while the next page loads.
      if (!navigating) setPending(false);
    }
  };

  /** The resend link in the `?verify=1` notice, before a sign-in attempt. */
  const resendFromNotice = async () => {
    if (resend === 'sending') return;
    if (!looksLikeEmail(email)) {
      setErrors({ email: 'Enter your email address first, then send the link.' });
      document.getElementById(ids.email)?.focus();
      return;
    }
    setResend('sending');
    try {
      const { error } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: next });
      if (!error) setResend('sent');
      else setResend(isRateLimited(error) ? 'limited' : 'failed');
    } catch {
      setResend('failed');
    }
  };

  if (unverifiedEmail) {
    return (
      <CheckInbox
        email={unverifiedEmail}
        next={next}
        title="Confirm your email first"
        actions={
          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-9"
            onClick={() => {
              setUnverifiedEmail(null);
              setPassword('');
            }}
          >
            Back to sign in
          </Button>
        }
      >
        <p>
          Your account is not confirmed yet. We just sent a fresh link to{' '}
          <span className="break-all font-medium text-zinc-900 dark:text-zinc-100">{unverifiedEmail}</span>. Open it to confirm
          your email and you will be signed in.
        </p>
      </CheckInbox>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {linkFailed ? (
        <FormAlert tone="info">
          That confirmation link has expired or was already used. Sign in below and we will email you a new one.
        </FormAlert>
      ) : verifyNotice ? (
        <FormAlert tone="info">
          <p>Confirm your email to continue. Sign in below and we will send you a fresh link.</p>
          <p className="mt-1">
            {resend === 'sent' ? (
              'Sent. Check your inbox.'
            ) : resend === 'limited' ? (
              RATE_LIMIT_MESSAGE
            ) : resend === 'failed' ? (
              NETWORK_MESSAGE
            ) : (
              <button
                type="button"
                onClick={resendFromNotice}
                disabled={resend === 'sending'}
                className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              >
                {resend === 'sending' ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
                {resend === 'sending' ? 'Sending...' : 'Resend the confirmation email'}
              </button>
            )}
          </p>
        </FormAlert>
      ) : null}

      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <Field id={ids.email} label="Email" error={errors.email}>
        <Input
          {...fieldA11y(ids.email, errors.email)}
          name="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) setErrors((current) => ({ ...current, email: undefined }));
          }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          className="h-11 sm:h-10"
        />
      </Field>

      <div className="space-y-1.5">
        <Field id={ids.password} label="Password" error={errors.password}>
          <PasswordInput
            {...fieldA11y(ids.password, errors.password)}
            name="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
            }}
            autoComplete="current-password"
            maxLength={128}
          />
        </Field>
        <p className="text-sm">
          <Link href={forgotHref} className={TEXT_LINK}>
            Forgot password?
          </Link>
        </p>
      </div>

      <SubmitButton pending={pending} label="Sign in" pendingLabel="Signing in..." />
    </form>
  );
}
