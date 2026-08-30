'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackEvent } from '@/lib/analytics';

type Purpose = 'get_listed' | 'update_listing';

const PURPOSES: { id: Purpose; label: string; detail: string }[] = [
  {
    id: 'get_listed',
    label: 'List a market',
    detail: 'Your market is not in the directory yet.',
  },
  {
    id: 'update_listing',
    label: 'Claim or correct a listing',
    detail: 'Your market is listed and you want to update or take ownership of it.',
  },
];

/**
 * The request form on `/for-market-operators`.
 *
 * Posts to the same `/api/discovery` endpoint the survey uses (Resend email,
 * nothing stored client-side), with `helpTopics` narrowed to the two operator
 * intents. When the page is reached from a market page's claim link
 * (`?market=<slug>`), the listing URL is seeded into the message so we know
 * which record the request is about.
 */
export function OperatorRequestForm() {
  const [purpose, setPurpose] = useState<Purpose>('get_listed');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [contactPermission, setContactPermission] = useState(false);
  // Honeypot, mirrored from the survey: bots fill it, people never see it.
  const [website, setWebsite] = useState('');
  const [marketSlug, setMarketSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('market');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return;
    // Post-hydration on purpose: the page is statically rendered, so the
    // query string is only knowable on the client, and seeding state here
    // avoids a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMarketSlug(slug);
    setPurpose('update_listing');
    setMessage((current) => (current ? current : `Listing: /markets/${slug}\n\n`));
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === 'sending') return;
    setError(null);

    if (!email.trim()) {
      setError('An email address is needed so we can follow up on your request.');
      return;
    }
    if (!contactPermission) {
      setError('Please confirm we may contact you about this request.');
      return;
    }

    setStatus('sending');
    try {
      const response = await fetch('/api/discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'farmers_market',
          helpTopics: [purpose],
          name,
          organization,
          email: email.trim(),
          phone: '',
          message,
          contactPermission,
          country: 'Market operators page',
          resultCount: 0,
          website,
        }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      // Also record a durable submission row for the review queue. The email
      // above is the notification; this is the premise for operator claiming,
      // so a failure here should not eat the request.
      try {
        await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: purpose === 'get_listed' ? 'new_market' : 'claim',
            ...(marketSlug ? { market_slug: marketSlug } : {}),
            email: email.trim(),
            payload: {
              source: 'for-market-operators',
              name,
              organization,
              message,
            },
          }),
        });
      } catch {
        // Logged server-side if it ever matters; the emailed request stands.
      }

      setStatus('sent');
      trackEvent('Operator Request Sent', { purpose });
    } catch {
      setStatus('idle');
      setError('Your request could not be sent. Please try again in a moment.');
    }
  };

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-green-600/30 bg-green-50 p-6 text-center dark:border-green-500/30 dark:bg-green-900/20">
        <p className="font-semibold text-green-800 dark:text-green-300">Request sent</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Thanks. We will follow up at the email address you provided.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What do you need?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PURPOSES.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3 text-sm transition-colors ${
                purpose === option.id
                  ? 'border-green-600 bg-green-50 dark:border-green-500 dark:bg-green-900/20'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600'
              }`}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="purpose"
                  value={option.id}
                  checked={purpose === option.id}
                  onChange={() => setPurpose(option.id)}
                  className="h-4 w-4 accent-green-600"
                />
                {option.label}
              </span>
              <span className="pl-6 text-xs text-zinc-500 dark:text-zinc-400">{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Name <span className="font-normal text-zinc-500">(optional)</span>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} autoComplete="name" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Market or organization <span className="font-normal text-zinc-500">(optional)</span>
          <Input value={organization} onChange={(event) => setOrganization(event.target.value)} maxLength={120} autoComplete="organization" />
        </label>
      </div>

      <label className="block space-y-1 text-sm font-medium">
        Email
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={254}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="block space-y-1 text-sm font-medium">
        Your market and what should change
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1200}
          rows={4}
          className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700"
          placeholder="Market name, where it runs, and what you want listed or corrected. A link to the listing or your website helps."
        />
      </label>

      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={contactPermission}
          onChange={(event) => setContactPermission(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-green-600"
        />
        <span>You may contact me about this request using the details I provided.</span>
      </label>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Contact details and your message are sent privately by email and are not included in Google
        or Vercel Analytics. See our{' '}
        <Link href="/privacy" className="underline hover:text-green-700">
          privacy policy
        </Link>
        .
      </p>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={status === 'sending'} className="w-fit bg-green-600 px-8 hover:bg-green-700">
        {status === 'sending' ? 'Sending...' : 'Send request'}
      </Button>
    </form>
  );
}
