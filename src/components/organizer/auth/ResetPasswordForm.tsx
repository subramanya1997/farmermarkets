'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Field,
  FormAlert,
  MAX_PASSWORD,
  MIN_PASSWORD,
  NETWORK_MESSAGE,
  PRIMARY_BUTTON,
  PasswordInput,
  RATE_LIMIT_MESSAGE,
  SubmitButton,
  TEXT_LINK,
  fieldA11y,
  isRateLimited,
  passwordProblem,
  useFieldIds,
} from './FormBits';

interface ResetPasswordFormProps {
  token: string;
  signInHref: string;
  forgotHref: string;
}

type Errors = Partial<Record<'password' | 'confirm', string>>;

export function ResetPasswordForm({ token, signInHref, forgotHref }: ResetPasswordFormProps) {
  const ids = useFieldIds(['password', 'confirm'] as const);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (done) headingRef.current?.focus();
  }, [done]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found: Errors = {};
    const problem = passwordProblem(password);
    if (problem) found.password = problem;
    if (!confirm) found.confirm = 'Type the new password again.';
    else if (confirm !== password) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (found.password || found.confirm) {
      document.getElementById(found.password ? ids.password : ids.confirm)?.focus();
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        if (isRateLimited(error)) setFormError(RATE_LIMIT_MESSAGE);
        else if (error.code === 'INVALID_TOKEN') setExpired(true);
        else if (error.code === 'PASSWORD_TOO_SHORT') setErrors({ password: `Use at least ${MIN_PASSWORD} characters.` });
        else if (error.code === 'PASSWORD_TOO_LONG') setErrors({ password: `Use ${MAX_PASSWORD} characters or fewer.` });
        else setFormError('We could not update your password. Try again in a moment.');
        return;
      }
      setDone(true);
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-green-700 dark:text-green-400" />
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
              Password updated
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Sign in with your new password. For safety, we signed you out on your other devices.
            </p>
          </div>
        </div>
        <Link href={signInHref} className={cn(buttonVariants(), PRIMARY_BUTTON)}>
          Sign in
        </Link>
      </div>
    );
  }

  if (expired) {
    return <ResetLinkExpired forgotHref={forgotHref} />;
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field id={ids.password} label="New password" error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
        <PasswordInput
          {...fieldA11y(ids.password, errors.password, 'hint')}
          name="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
          }}
          autoComplete="new-password"
          maxLength={MAX_PASSWORD}
        />
      </Field>
      <Field id={ids.confirm} label="Confirm new password" error={errors.confirm}>
        <PasswordInput
          {...fieldA11y(ids.confirm, errors.confirm)}
          name="confirm"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            if (errors.confirm) setErrors((current) => ({ ...current, confirm: undefined }));
          }}
          autoComplete="new-password"
          maxLength={MAX_PASSWORD}
        />
      </Field>
      <SubmitButton pending={pending} label="Save new password" pendingLabel="Saving..." />
    </form>
  );
}

/** Shown for `?error=INVALID_TOKEN`, a missing token, or a token the server rejects. */
export function ResetLinkExpired({ forgotHref }: { forgotHref: string }) {
  return (
    <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">This link has expired</h2>
      <p>Reset links work for one hour and only once. Ask for a new one and use the newest email.</p>
      <p>
        <Link href={forgotHref} className={TEXT_LINK}>
          Send a new reset link
        </Link>
      </p>
    </div>
  );
}
