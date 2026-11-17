'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { claimMarketAction } from '@/app/(app)/dashboard/actions';
import { CLAIM_ROLES, CLAIM_ROLE_LABELS, type ClaimRole } from '@/lib/claimRoles';
import { trackEvent } from '@/lib/analytics';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Field,
  FormAlert,
  NETWORK_MESSAGE,
  PRIMARY_BUTTON,
  SubmitButton,
  fieldA11y,
  useFieldIds,
} from '@/components/organizer/auth/FormBits';

type FieldName = 'role' | 'phone' | 'message' | 'evidenceUrl';
type Errors = Partial<Record<FieldName, string>>;

const FIELD_ORDER: FieldName[] = ['role', 'phone', 'message', 'evidenceUrl'];

/** Server messages are written for developers; these are for organizers. */
const FRIENDLY_ERRORS: Record<FieldName, string> = {
  role: 'Choose your role at the market.',
  phone: 'Keep the phone number under 40 characters.',
  message: 'Keep this under 1,000 characters.',
  evidenceUrl: 'Enter a full web address starting with https://',
};

function looksLikeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

interface ClaimFormProps {
  marketSlug: string;
  marketName: string;
  marketId: string;
}

export function ClaimForm({ marketSlug, marketName, marketId }: ClaimFormProps) {
  const ids = useFieldIds(['role', 'phone', 'message', 'evidenceUrl'] as const);
  const [role, setRole] = useState<ClaimRole | ''>('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const successRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  const clear = (field: FieldName) => {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const focusFirst = (found: Errors) => {
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) document.getElementById(ids[first])?.focus();
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setFormError(null);

    const found: Errors = {};
    if (!role) found.role = FRIENDLY_ERRORS.role;
    const url = evidenceUrl.trim();
    if (url && !looksLikeUrl(url)) found.evidenceUrl = FRIENDLY_ERRORS.evidenceUrl;
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirst(found);
      return;
    }

    startTransition(async () => {
      try {
        const result = await claimMarketAction(marketSlug, {
          role,
          phone: phone.trim(),
          message: message.trim(),
          evidenceUrl: url,
        });
        if (result.ok) {
          trackEvent('listing_claim_submitted', { market_id: marketId });
          setSuccess(result.message ?? 'Thanks. We will email you once your claim is reviewed.');
          return;
        }
        if ('fieldErrors' in result && result.fieldErrors.length) {
          const fromServer: Errors = {};
          for (const { path } of result.fieldErrors) {
            const field = path.split('.')[0] as FieldName;
            if (FIELD_ORDER.includes(field)) fromServer[field] = FRIENDLY_ERRORS[field];
          }
          setErrors(fromServer);
          focusFirst(fromServer);
        }
        setFormError(result.error);
      } catch {
        setFormError(NETWORK_MESSAGE);
      }
    });
  };

  if (success) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border border-green-600/30 bg-green-50 p-5 sm:p-6 dark:border-green-500/30 dark:bg-green-900/20">
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-green-700 dark:text-green-400" />
          <div>
            <h2 ref={successRef} tabIndex={-1} className="text-lg font-semibold text-green-900 outline-none dark:text-green-200">
              Claim sent for {marketName}
            </h2>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{success}</p>
          </div>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants(), PRIMARY_BUTTON, 'sm:w-fit sm:px-6')}>
          Back to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}

      <Field id={ids.role} label="Your role at the market" error={errors.role}>
        <Select
          name="role"
          value={role}
          onValueChange={(value) => {
            setRole(value as ClaimRole);
            clear('role');
          }}
        >
          <SelectTrigger
            {...fieldA11y(ids.role, errors.role)}
            className="w-full text-base data-[size=default]:h-11 sm:text-sm sm:data-[size=default]:h-10"
          >
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent position="popper">
            {CLAIM_ROLES.map((value) => (
              <SelectItem key={value} value={value} className="min-h-11 text-base sm:min-h-0 sm:text-sm">
                {CLAIM_ROLE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id={ids.message}
        label="How can we confirm you run this market?"
        optional
        error={errors.message}
        hint="For example: your title, how long you have run it, or a staff member we can check with."
      >
        <Textarea
          {...fieldA11y(ids.message, errors.message, 'hint')}
          name="message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            clear('message');
          }}
          rows={4}
          maxLength={1000}
          className="min-h-28"
        />
      </Field>

      <Field
        id={ids.evidenceUrl}
        label="Link that shows your role"
        optional
        error={errors.evidenceUrl}
        hint="A page on the market's website that lists staff or contacts works well."
      >
        <Input
          {...fieldA11y(ids.evidenceUrl, errors.evidenceUrl, 'hint')}
          name="evidenceUrl"
          type="url"
          inputMode="url"
          value={evidenceUrl}
          onChange={(event) => {
            setEvidenceUrl(event.target.value);
            clear('evidenceUrl');
          }}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={500}
          placeholder="https://"
          className="h-11 sm:h-10"
        />
      </Field>

      <Field id={ids.phone} label="Phone" optional error={errors.phone} hint="Only used if we need to check something with you.">
        <Input
          {...fieldA11y(ids.phone, errors.phone, 'hint')}
          name="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value);
            clear('phone');
          }}
          autoComplete="tel"
          maxLength={40}
          className="h-11 sm:h-10"
        />
      </Field>

      <div className="sm:w-fit [&>button]:sm:px-8">
        <SubmitButton pending={pending} label="Send claim for review" pendingLabel="Sending..." />
      </div>
    </form>
  );
}
