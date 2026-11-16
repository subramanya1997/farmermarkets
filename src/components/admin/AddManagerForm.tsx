'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addManagerAction } from '@/app/admin/actions';

/** Gives an existing, verified account access to a market without a claim. */
export function AddManagerForm({ slug }: { slug: string }) {
  const router = useRouter();
  const inputId = useId();
  const hintId = useId();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setResult(null);
    startTransition(async () => {
      const response = await addManagerAction(slug, address);
      if (response.ok) {
        setEmail('');
        setResult({ ok: true, text: response.message ?? 'Access granted.' });
        router.refresh();
      } else {
        setResult({ ok: false, text: response.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-1.5 px-4 py-3">
      <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
        Add a manager by email
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="email"
          inputMode="email"
          autoComplete="off"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isPending}
          placeholder="name@example.org"
          aria-describedby={hintId}
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending || !email.trim()}>
          {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
          Add
        </Button>
      </div>
      <p id={hintId} className="text-xs text-zinc-500 dark:text-zinc-400">
        They need an account with a confirmed email first.
      </p>
      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'text-xs text-green-700 dark:text-green-400' : 'text-xs text-red-700 dark:text-red-400'}
        >
          {result.text}
        </p>
      ) : null}
    </form>
  );
}
