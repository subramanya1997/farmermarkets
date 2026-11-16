'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { FormAlert, NETWORK_MESSAGE, RATE_LIMIT_MESSAGE, isRateLimited } from './FormBits';

interface CheckInboxProps {
  email: string;
  /** Where the confirmation link should land once the email is confirmed. */
  next: string;
  title?: string;
  children?: ReactNode;
  /** Extra actions under the resend button, like "Use a different email". */
  actions?: ReactNode;
}

type ResendState = 'idle' | 'sending' | 'sent' | 'limited' | 'failed';

/**
 * "Check your inbox" panel shown after sign-up, and after a sign-in attempt
 * with an unconfirmed email. Focus moves here so the change is announced.
 */
export function CheckInbox({ email, next, title = 'Check your inbox', children, actions }: CheckInboxProps) {
  const [state, setState] = useState<ResendState>('idle');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const resend = async () => {
    if (state === 'sending') return;
    setState('sending');
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: next });
      if (!error) setState('sent');
      else setState(isRateLimited(error) ? 'limited' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          <MailCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            {title}
          </h2>
          <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {children ?? (
              <p>
                We sent a confirmation link to <span className="break-all font-medium text-zinc-900 dark:text-zinc-100">{email}</span>.
                Open it to confirm your email and continue.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Nothing after a few minutes? Check your spam folder, or send the link again. The link works for 24 hours.
      </p>

      {state === 'sent' ? <FormAlert tone="success">Sent again. It can take a minute or two to arrive.</FormAlert> : null}
      {state === 'limited' ? <FormAlert>{RATE_LIMIT_MESSAGE}</FormAlert> : null}
      {state === 'failed' ? <FormAlert>{NETWORK_MESSAGE}</FormAlert> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" variant="outline" onClick={resend} disabled={state === 'sending'} className="h-11 sm:h-9">
          {state === 'sending' ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {state === 'sending' ? 'Sending...' : 'Send the link again'}
        </Button>
        {actions}
      </div>
    </div>
  );
}
