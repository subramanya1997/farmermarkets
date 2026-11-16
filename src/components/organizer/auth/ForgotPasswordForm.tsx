'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Input } from '@/components/ui/input';
import {
  Field,
  FormAlert,
  NETWORK_MESSAGE,
  RATE_LIMIT_MESSAGE,
  SubmitButton,
  TEXT_LINK,
  fieldA11y,
  isRateLimited,
  looksLikeEmail,
  useFieldIds,
} from './FormBits';

interface ForgotPasswordFormProps {
  /** Reset page path (with `?next=` kept) the emailed link should open. */
  resetPath: string;
  signInHref: string;
}

/**
 * Asks for a reset link. The reply is the same whether or not an account
 * uses the email, so the form never reveals who has an account.
 */
export function ForgotPasswordForm({ resetPath, signInHref }: ForgotPasswordFormProps) {
  const ids = useFieldIds(['email'] as const);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (sentTo) headingRef.current?.focus();
  }, [sentTo]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    if (!looksLikeEmail(email)) {
      setError(email.trim() ? 'That email address does not look right.' : 'Enter your email address.');
      document.getElementById(ids.email)?.focus();
      return;
    }
    setPending(true);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: resetPath });
      if (requestError && isRateLimited(requestError)) {
        setFormError(RATE_LIMIT_MESSAGE);
        return;
      }
      if (requestError) {
        setFormError('We could not send that right now. Try again in a few minutes.');
        return;
      }
      setSentTo(email.trim());
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          <MailCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-zinc-900 outline-none dark:text-zinc-100">
            Check your inbox
          </h2>
          <p>
            If an account uses <span className="break-all font-medium text-zinc-900 dark:text-zinc-100">{sentTo}</span>, we sent
            it a link to choose a new password. The link works for one hour.
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Nothing after a few minutes? Check your spam folder.</p>
          <p>
            <Link href={signInHref} className={TEXT_LINK}>
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field id={ids.email} label="Email" error={error}>
        <Input
          {...fieldA11y(ids.email, error)}
          name="email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (error) setError(undefined);
          }}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          className="h-11 sm:h-10"
        />
      </Field>
      <SubmitButton pending={pending} label="Send reset link" pendingLabel="Sending..." />
    </form>
  );
}
