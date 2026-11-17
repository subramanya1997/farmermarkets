'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { trackEvent } from '@/lib/analytics';
import { Input } from '@/components/ui/input';
import {
  Field,
  FormAlert,
  NETWORK_MESSAGE,
  RATE_LIMIT_MESSAGE,
  SubmitButton,
  fieldA11y,
  isRateLimited,
  looksLikeEmail,
  useFieldIds,
} from './FormBits';

const CODE_LENGTH = 6;

interface EmailCodeFormProps {
  /** Validated same-site path to load once signed in. */
  next: string;
  /** Where the form is, for analytics: "claim" or "sign_in". */
  surface: 'claim' | 'sign_in';
}

/**
 * Passwordless sign-in: email, then the 6 digit code we send to it. The first
 * code for a new address creates the organizer account. After signing in the
 * page at `next` loads fresh, so the server sees the new session.
 */
export function EmailCodeForm({ next, surface }: EmailCodeFormProps) {
  const ids = useFieldIds(['email', 'code'] as const);
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async (resend = false) => {
    setError(null);
    setNotice(null);
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setFieldError(address ? 'That email address does not look right.' : 'Enter your email address.');
      document.getElementById(ids.email)?.focus();
      return;
    }
    setPending(true);
    try {
      const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: 'sign-in' });
      if (sendError) {
        setError(isRateLimited(sendError) ? RATE_LIMIT_MESSAGE : 'We could not send a code. Try again in a moment.');
        return;
      }
      trackEvent('organizer_code_requested', { surface, resend });
      setCode('');
      setStep('code');
      if (resend) setNotice('We sent a new code. Use the newest one.');
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  const verify = async () => {
    setError(null);
    setNotice(null);
    const digits = code.replace(/\D/g, '');
    if (digits.length !== CODE_LENGTH) {
      setFieldError(`Enter the ${CODE_LENGTH} digit code from the email.`);
      codeRef.current?.focus();
      return;
    }
    setPending(true);
    let navigating = false;
    try {
      const { error: signInError } = await authClient.signIn.emailOtp({ email: email.trim(), otp: digits });
      if (signInError) {
        if (isRateLimited(signInError)) setError(RATE_LIMIT_MESSAGE);
        else if (signInError.code === 'OTP_EXPIRED') setError('That code has expired. Send a new one.');
        else if (signInError.code === 'TOO_MANY_ATTEMPTS') setError('Too many wrong tries for that code. Send a new one.');
        else setError('That code is not right. Check the email and try again.');
        return;
      }
      trackEvent('organizer_signed_in', { surface, method: 'email_code' });
      navigating = true;
      // A full load, so every server component sees the new session cookie.
      window.location.assign(next);
    } catch {
      setError(NETWORK_MESSAGE);
    } finally {
      if (!navigating) setPending(false);
    }
  };

  if (step === 'email') {
    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!pending) void sendCode();
        }}
      >
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field id={ids.email} label="Email" error={fieldError}>
          <Input
            {...fieldA11y(ids.email, fieldError)}
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldError(undefined);
            }}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            className="h-11 sm:h-10"
          />
        </Field>
        <SubmitButton pending={pending} label="Email me a code" pendingLabel="Sending..." />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">No password needed. New here? The code sets up your account.</p>
      </form>
    );
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) void verify();
      }}
    >
      <FormAlert tone="success">
        We sent a {CODE_LENGTH} digit code to <span className="break-all font-medium">{email.trim()}</span>. It works for 10 minutes.
      </FormAlert>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
      <Field id={ids.code} label="Code" error={fieldError}>
        <Input
          {...fieldA11y(ids.code, fieldError)}
          ref={codeRef}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_LENGTH + 2}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/[^\d ]/g, ''));
            setFieldError(undefined);
          }}
          className="h-12 text-center font-mono text-xl tracking-[0.4em] sm:h-12"
        />
      </Field>
      <SubmitButton pending={pending} label="Sign in" pendingLabel="Checking..." />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setStep('email');
            setError(null);
            setNotice(null);
            setFieldError(undefined);
          }}
          className="font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Use a different email
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void sendCode(true)}
          className="inline-flex items-center gap-1.5 font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400"
        >
          {pending ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
          Send a new code
        </button>
      </div>
    </form>
  );
}
