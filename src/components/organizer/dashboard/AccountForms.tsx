'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  TEXT_LINK,
  fieldA11y,
  isRateLimited,
  passwordProblem,
  useFieldIds,
} from '../auth/FormBits';

const MAX_NAME = 100;

function Submit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} className={cn(PRIMARY_BUTTON, 'sm:w-auto sm:px-5')}>
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ *
 * Name
 * ------------------------------------------------------------------ */

export function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const ids = useFieldIds(['name'] as const);
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(initialName);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setDone(false);
    const value = name.trim();
    if (!value) {
      setError('Add your name.');
      document.getElementById(ids.name)?.focus();
      return;
    }
    if (value.length > MAX_NAME) {
      setError(`Use ${MAX_NAME} characters or fewer.`);
      document.getElementById(ids.name)?.focus();
      return;
    }
    if (value === saved) {
      setName(value);
      setDone(true);
      return;
    }

    setPending(true);
    try {
      const { error: apiError } = await authClient.updateUser({ name: value });
      if (apiError) {
        setFormError(isRateLimited(apiError) ? RATE_LIMIT_MESSAGE : 'We could not save your name. Try again in a moment.');
        return;
      }
      setName(value);
      setSaved(value);
      setDone(true);
      router.refresh();
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {done ? <FormAlert tone="success">Saved.</FormAlert> : null}
      <Field id={ids.name} label="Your name" error={error} hint="Our team sees it when they review your claims and updates.">
        <Input
          {...fieldA11y(ids.name, error, 'hint')}
          name="name"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="name"
          className="h-11 sm:h-10"
          onChange={(event) => {
            setName(event.target.value);
            setDone(false);
            if (error) setError(undefined);
          }}
        />
      </Field>
      <div>
        <Submit pending={pending} label="Save name" pendingLabel="Saving" />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ *
 * Password
 * ------------------------------------------------------------------ */

type PasswordErrors = Partial<Record<'current' | 'next' | 'confirm', string>>;

export function PasswordForm({ forgotHref }: { forgotHref: string }) {
  const ids = useFieldIds(['current', 'next', 'confirm'] as const);
  const revokeId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { revoked: boolean }>(null);
  const [pending, setPending] = useState(false);

  function clearError(key: keyof PasswordErrors) {
    setDone(null);
    if (errors[key]) setErrors((value) => ({ ...value, [key]: undefined }));
  }

  function focusFirst(found: PasswordErrors) {
    const first = (['current', 'next', 'confirm'] as const).find((key) => found[key]);
    if (first) document.getElementById(ids[first])?.focus();
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setDone(null);

    const found: PasswordErrors = {};
    if (!current) found.current = 'Type your current password.';
    const problem = passwordProblem(next);
    if (problem) found.next = problem === 'Choose a password.' ? 'Choose a new password.' : problem;
    else if (next === current) found.next = 'Choose a password different from your current one.';
    if (!confirm) found.confirm = 'Type the new password again.';
    else if (!found.next && confirm !== next) found.confirm = 'The two passwords do not match.';
    setErrors(found);
    if (found.current || found.next || found.confirm) {
      focusFirst(found);
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: revokeOthers,
      });
      if (error) {
        if (isRateLimited(error)) setFormError(RATE_LIMIT_MESSAGE);
        else if (error.code === 'INVALID_PASSWORD') {
          const wrong = { current: 'That is not your current password.' };
          setErrors(wrong);
          focusFirst(wrong);
        } else if (error.code === 'PASSWORD_TOO_SHORT') setErrors({ next: `Use at least ${MIN_PASSWORD} characters.` });
        else if (error.code === 'PASSWORD_TOO_LONG') setErrors({ next: `Use ${MAX_PASSWORD} characters or fewer.` });
        else if (error.code === 'CREDENTIAL_ACCOUNT_NOT_FOUND')
          setFormError('This account has no password yet. Use the forgot password link below to set one.');
        else setFormError('We could not change your password. Try again in a moment.');
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone({ revoked: revokeOthers });
    } catch {
      setFormError(NETWORK_MESSAGE);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {done ? (
        <FormAlert tone="success">
          Password changed.{done.revoked ? ' We signed you out on your other devices.' : ''}
        </FormAlert>
      ) : null}

      <Field id={ids.current} label="Current password" error={errors.current}>
        <PasswordInput
          {...fieldA11y(ids.current, errors.current)}
          name="current-password"
          value={current}
          autoComplete="current-password"
          onChange={(event) => {
            setCurrent(event.target.value);
            clearError('current');
          }}
        />
      </Field>
      <Field id={ids.next} label="New password" error={errors.next} hint={`At least ${MIN_PASSWORD} characters.`}>
        <PasswordInput
          {...fieldA11y(ids.next, errors.next, 'hint')}
          name="new-password"
          value={next}
          maxLength={MAX_PASSWORD}
          autoComplete="new-password"
          onChange={(event) => {
            setNext(event.target.value);
            clearError('next');
          }}
        />
      </Field>
      <Field id={ids.confirm} label="Confirm new password" error={errors.confirm}>
        <PasswordInput
          {...fieldA11y(ids.confirm, errors.confirm)}
          name="confirm-password"
          value={confirm}
          maxLength={MAX_PASSWORD}
          autoComplete="new-password"
          onChange={(event) => {
            setConfirm(event.target.value);
            clearError('confirm');
          }}
        />
      </Field>

      <div className="flex items-start gap-3">
        <Checkbox
          id={revokeId}
          className="mt-0.5"
          checked={revokeOthers}
          onChange={(event) => setRevokeOthers(event.target.checked)}
        />
        <label htmlFor={revokeId} className="text-sm">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">Sign out of other devices</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            A good idea if you shared your password or signed in on a shared computer.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Submit pending={pending} label="Change password" pendingLabel="Changing" />
        <Link href={forgotHref} className={cn(TEXT_LINK, 'text-sm')}>
          Forgot your current password?
        </Link>
      </div>
    </form>
  );
}
