'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, LoaderCircle, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { inviteVendorAction } from '@/app/(app)/admin/vendors/actions';
import { Field, FieldErrorsContext, GREEN_CHECK, TextArea, TextInput } from '@/components/vendor/fields';
import { cn } from '@/lib/utils';

/** Adds a vendor account by email. The invite email only goes out when the box is checked. */
export function VendorInviteForm() {
  const router = useRouter();
  const checkId = useId();
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [markets, setMarkets] = useState('');
  const [notify, setNotify] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setErrors({});
    setCopied(false);
    const address = email.trim();
    if (!address) {
      setErrors({ email: 'Enter an email address' });
      return;
    }
    startTransition(async () => {
      const response = await inviteVendorAction({
        email: address,
        businessName: businessName.trim() || undefined,
        markets: markets
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        notify,
      });
      if (!response.ok) {
        setErrors(Object.fromEntries((response.fieldErrors ?? []).map((issue) => [issue.path, issue.message])));
        setResult({ ok: false, text: response.error });
        return;
      }
      setResult({ ok: true, text: response.message ?? 'Invite created.', url: response.inviteUrl });
      setEmail('');
      setBusinessName('');
      setMarkets('');
      setNotify(false);
      router.refresh();
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900" aria-label="Invite a vendor">
      <div className="border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">Invite a vendor</h2>
      </div>
      <FieldErrorsContext.Provider value={errors}>
        <form onSubmit={submit} className="space-y-4 px-4 py-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" path="email">
              {(control) => (
                <TextInput
                  {...control}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={254}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isPending}
                  placeholder="name@example.com"
                />
              )}
            </Field>
            <Field label="Business name" optional path="businessName">
              {(control) => (
                <TextInput
                  {...control}
                  maxLength={120}
                  autoComplete="off"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  disabled={isPending}
                />
              )}
            </Field>
          </div>
          <Field
            label="Markets"
            optional
            path="markets"
            hint="One market link or slug per line. The vendor sees these as suggestions to apply to."
          >
            {(control) => (
              <TextArea
                {...control}
                rows={3}
                value={markets}
                onChange={(event) => setMarkets(event.target.value)}
                disabled={isPending}
                placeholder="https://farmermarkets.app/markets/example-market"
              />
            )}
          </Field>
          <div className="flex items-start gap-3">
            <Checkbox
              id={checkId}
              checked={notify}
              onCheckedChange={(value) => setNotify(value === true)}
              disabled={isPending}
              className={cn('mt-0.5 size-5', GREEN_CHECK)}
            />
            <label htmlFor={checkId} className="text-sm leading-5">
              Send the invite email now
              <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                Checking this emails the address above. Leave it unchecked to only create the account and share the link yourself.
              </span>
            </label>
          </div>
          <Button type="submit" disabled={isPending} className="h-11 sm:h-9">
            {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            {notify ? 'Create and send invite' : 'Create invite'}
          </Button>

          {result ? (
            <div
              role={result.ok ? 'status' : 'alert'}
              className={
                result.ok
                  ? 'space-y-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-950/40 dark:text-green-100'
                  : 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200'
              }
            >
              <p>{result.text}</p>
              {result.url ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="min-w-0 flex-1 rounded bg-white/70 px-2 py-1.5 text-xs break-all dark:bg-zinc-900/70">{result.url}</code>
                  <Button type="button" variant="outline" onClick={() => copy(result.url!)} className="h-11 sm:h-8">
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </FieldErrorsContext.Provider>
    </section>
  );
}
