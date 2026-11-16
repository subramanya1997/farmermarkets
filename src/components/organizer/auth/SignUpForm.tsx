'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckInbox } from './CheckInbox';
import {
  Field,
  FormAlert,
  MAX_PASSWORD,
  MIN_PASSWORD,
  NETWORK_MESSAGE,
  PasswordInput,
  RATE_LIMIT_MESSAGE,
  SubmitButton,
  TEXT_LINK,
  fieldA11y,
  isRateLimited,
  looksLikeEmail,
  passwordProblem,
  useFieldIds,
} from './FormBits';

type FieldName = 'name' | 'email' | 'password' | 'confirm';
type Errors = Partial<Record<FieldName, string>>;

interface SignUpFormProps {
  /** Validated same-site path the confirmation link lands on. */
  next: string;
  signInHref: string;
}

export function SignUpForm({ next, signInHref }: SignUpFormProps) {
  const ids = useFieldIds(['name', 'email', 'password', 'confirm'] as const);
  const [values, setValues] = useState<Record<FieldName, string>>({ name: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const update = (field: FieldName) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = (): Errors => {
    const found: Errors = {};
    if (!values.name.trim()) found.name = 'Enter your name.';
    if (!values.email.trim()) found.email = 'Enter your email address.';
    else if (!looksLikeEmail(values.email)) found.email = 'That email address does not look right.';
    found.password = passwordProblem(values.password);
    if (!values.confirm) found.confirm = 'Type the password again.';
    else if (values.confirm !== values.password) found.confirm = 'The two passwords do not match.';
    return Object.fromEntries(Object.entries(found).filter(([, message]) => message)) as Errors;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const found = validate();
    setErrors(found);
    const firstInvalid = (['name', 'email', 'password', 'confirm'] as const).find((field) => found[field]);
    if (firstInvalid) {
      document.getElementById(ids[firstInvalid])?.focus();
      return;
    }

    setPending(true);
    const email = values.email.trim();
    try {
      const { error } = await authClient.signUp.email({
        name: values.name.trim(),
        email,
        password: values.password,
        callbackURL: next,
      });
      if (error) {
        if (isRateLimited(error)) setFormError(RATE_LIMIT_MESSAGE);
        else if (error.code === 'PASSWORD_TOO_SHORT') setErrors({ password: `Use at least ${MIN_PASSWORD} characters.` });
        else if (error.code === 'PASSWORD_TOO_LONG') setErrors({ password: `Use ${MAX_PASSWORD} characters or fewer.` });
        else if (error.code === 'INVALID_EMAIL') setErrors({ email: 'That email address does not look right.' });
        else setFormError('We could not create your account. Try again in a moment.');
        return;
      }
      trackEvent('Organizer Sign Up Submitted');
      setSentTo(email);
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  if (sentTo) {
    return (
      <CheckInbox
        email={sentTo}
        next={next}
        title="Check your inbox to confirm your email"
        actions={
          <Button
            type="button"
            variant="ghost"
            className="h-11 sm:h-9"
            onClick={() => {
              setSentTo(null);
              setValues((current) => ({ ...current, password: '', confirm: '' }));
            }}
          >
            Use a different email
          </Button>
        }
      >
        <p>
          We sent a link to <span className="break-all font-medium text-zinc-900 dark:text-zinc-100">{sentTo}</span>. Open it to
          confirm your email. It signs you in and takes you on to the next step.
        </p>
        <p className="mt-2">
          Already confirmed?{' '}
          <Link href={signInHref} className={TEXT_LINK}>
            Sign in
          </Link>
        </p>
      </CheckInbox>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <Field id={ids.name} label="Your name" error={errors.name}>
        <Input
          {...fieldA11y(ids.name, errors.name)}
          name="name"
          value={values.name}
          onChange={update('name')}
          autoComplete="name"
          maxLength={100}
          className="h-11 sm:h-10"
        />
      </Field>

      <Field id={ids.email} label="Email" error={errors.email} hint="Use your market email if you have one. It makes your claim faster to confirm.">
        <Input
          {...fieldA11y(ids.email, errors.email, 'hint')}
          name="email"
          type="email"
          inputMode="email"
          value={values.email}
          onChange={update('email')}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          placeholder="you@yourmarket.org"
          className="h-11 sm:h-10"
        />
      </Field>

      <Field id={ids.password} label="Password" error={errors.password} hint={`At least ${MIN_PASSWORD} characters.`}>
        <PasswordInput
          {...fieldA11y(ids.password, errors.password, 'hint')}
          name="password"
          value={values.password}
          onChange={update('password')}
          autoComplete="new-password"
          maxLength={MAX_PASSWORD}
        />
      </Field>

      <Field id={ids.confirm} label="Confirm password" error={errors.confirm}>
        <PasswordInput
          {...fieldA11y(ids.confirm, errors.confirm)}
          name="confirm"
          value={values.confirm}
          onChange={update('confirm')}
          autoComplete="new-password"
          maxLength={MAX_PASSWORD}
        />
      </Field>

      <SubmitButton pending={pending} label="Create account" pendingLabel="Creating account..." />

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        We only use your email for your account and updates about your listing. See our{' '}
        <Link href="/privacy" className="underline hover:text-green-700 dark:hover:text-green-400">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
