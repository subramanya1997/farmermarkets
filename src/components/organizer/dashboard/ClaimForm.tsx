'use client';

import { useState, useTransition } from 'react';
import { claimMarketAction } from '@/app/(app)/dashboard/actions';
import { CLAIM_ROLES, CLAIM_ROLE_LABELS, type ClaimRole } from '@/lib/claimRoles';
import { trackEvent } from '@/lib/analytics';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { Field, FormAlert, NETWORK_MESSAGE, SubmitButton, fieldA11y, useFieldIds } from '@/components/organizer/auth/FormBits';

interface ClaimFormProps {
  marketSlug: string;
  marketId: string;
}

/**
 * One tap and an optional note. Sending it opens the listing editor right
 * away; nothing goes live until the claim is confirmed.
 */
export function ClaimForm({ marketSlug, marketId }: ClaimFormProps) {
  const ids = useFieldIds(['role', 'message'] as const);
  const [role, setRole] = useState<ClaimRole | ''>('');
  const [message, setMessage] = useState('');
  const [roleError, setRoleError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || navigating) return;
    setFormError(null);
    if (!role) {
      setRoleError('Pick your role at the market.');
      document.getElementById(ids.role)?.querySelector('button')?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const result = await claimMarketAction(marketSlug, { role, message: message.trim() });
        if (result.ok) {
          trackEvent('listing_claim_submitted', { market_id: marketId });
          setNavigating(true);
          // A full load, so the dashboard layout's market list picks up the new claim too.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the shared layout must re-render
          window.location.assign(`/dashboard/markets/${marketSlug}`);
          return;
        }
        setFormError(result.error);
      } catch {
        setFormError(NETWORK_MESSAGE);
      }
    });
  };

  const busy = pending || navigating;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <Field id={ids.role} label="Your role at the market" error={roleError}>
        <ToggleGroup
          id={ids.role}
          type="single"
          variant="outline"
          spacing={2}
          value={role}
          onValueChange={(next) => {
            setRole(next as ClaimRole | '');
            setRoleError(undefined);
          }}
          aria-invalid={roleError ? true : undefined}
          aria-describedby={roleError ? `${ids.role}-error` : undefined}
          className="w-full flex-wrap"
        >
          {CLAIM_ROLES.map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className={cn(
                'h-11 rounded-full bg-white px-4 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-300',
                'focus-visible:border-green-700 focus-visible:ring-green-600/40',
                'data-[state=on]:border-green-700 data-[state=on]:bg-green-700 data-[state=on]:text-white data-[state=on]:hover:bg-green-800 dark:data-[state=on]:border-green-600',
              )}
            >
              {CLAIM_ROLE_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <Field
        id={ids.message}
        label="Anything that helps us confirm it's you?"
        optional
        hint="Your title, a staff page link, or a phone number we can call."
      >
        <Textarea
          {...fieldA11y(ids.message, undefined, 'hint')}
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          maxLength={1000}
          className="min-h-20 text-base sm:text-sm"
        />
      </Field>

      <div className="sm:w-fit [&>button]:sm:px-8">
        <SubmitButton pending={busy} label="Claim and start editing" pendingLabel="Opening your editor..." />
      </div>
    </form>
  );
}
