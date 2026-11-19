'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';
import { startVendorAction } from '@/app/(app)/vendor/actions';
import { PRODUCT_CODES } from '@/lib/listingEdits';
import { MAX_START_MARKETS, vendorStartSchema } from '@/lib/vendorProfile';
import { PRODUCT_LABELS } from '@/components/organizer/editor/labels';
import { ChipGroup, Field, FieldErrorsContext, FieldGroup, RemoveButton, TextInput } from './fields';
import { MarketPicker } from './MarketPicker';
import { StickyBar, focusFirstInvalid, toErrorMap, useLeaveGuard, type Notice } from './StickyBar';
import { place } from './bits';

type Product = (typeof PRODUCT_CODES)[number];

export interface StartMarket {
  slug: string;
  name: string;
  city?: string;
  state?: string;
}

/**
 * The whole start on one screen: business name, what you sell, and the
 * markets you sell at. One button sends the profile for review and applies to
 * every market picked. Photos, a description, links and documents come later.
 */
export function StartForm({
  initialName,
  initialProducts,
  initialMarkets,
  appliedSlugs,
}: {
  initialName: string;
  initialProducts: Product[];
  initialMarkets: StartMarket[];
  /** Markets this account already applied to; search shows them as done. */
  appliedSlugs: string[];
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState(initialName);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [markets, setMarkets] = useState<StartMarket[]>(initialMarkets);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [done, setDone] = useState(false);
  const [sending, startSending] = useTransition();

  const touched = name.trim() !== initialName.trim() || products.length !== initialProducts.length || markets.length !== initialMarkets.length;
  useLeaveGuard(touched && !done);

  // Errors from the last send fade out as they are fixed.
  const errors = useMemo(() => {
    const current: Record<string, string> = {};
    if (submitted.name && name.trim().length < 2) current.name = submitted.name;
    if (submitted.products && products.length === 0) current.products = submitted.products;
    return current;
  }, [submitted, name, products]);

  function fail(list: { path: string; message: string }[], text: string) {
    setSubmitted(toErrorMap(list));
    setNotice({ tone: 'error', text });
    focusFirstInvalid(rootRef.current);
  }

  function submit() {
    if (sending || done) return;
    const payload = { name: name.trim(), products, markets: markets.map((market) => market.slug) };
    const parsed = vendorStartSchema.safeParse(payload);
    if (!parsed.success) {
      fail(
        parsed.error.issues.map((issue) => ({ path: String(issue.path[0] ?? ''), message: issue.message })),
        'Add your business name and what you sell.',
      );
      return;
    }
    setSubmitted({});
    setNotice(null);
    startSending(async () => {
      try {
        const result = await startVendorAction(payload);
        if (result.ok) {
          setDone(true);
          setNotice({ tone: 'success', text: result.message ?? 'Sent for review.' });
          router.refresh();
        } else if (result.fieldErrors?.length) {
          fail(result.fieldErrors, result.error);
        } else {
          setNotice({ tone: 'error', text: result.error });
        }
      } catch {
        setNotice({ tone: 'error', text: 'That did not go through. Check your connection and try again.' });
      }
    });
  }

  const room = MAX_START_MARKETS - markets.length;

  return (
    <FieldErrorsContext.Provider value={errors}>
      {/* Not a <form>: Enter in the market search should never send everything. */}
      <div ref={rootRef} className="flex flex-col gap-4">
        <section className="flex flex-col gap-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <Field label="Business name" path="name">
            {(control) => (
              <TextInput
                {...control}
                value={name}
                maxLength={120}
                autoComplete="organization"
                enterKeyHint="next"
                placeholder="Green Gate Farm"
                onChange={(event) => {
                  setName(event.target.value);
                  setNotice(null);
                }}
              />
            )}
          </Field>

          <FieldGroup legend="What you sell" path="products">
            <ChipGroup
              options={PRODUCT_CODES}
              labels={PRODUCT_LABELS}
              value={products}
              onChange={(next) => {
                setProducts(next);
                setNotice(null);
              }}
            />
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Markets you sell at <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
            </h2>
            {markets.length > 0 ? (
              <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {markets.map((market) => (
                  <li key={market.slug} className="flex min-h-14 items-center gap-2 py-1 pr-1 pl-4">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium break-words text-zinc-900 dark:text-zinc-100">{market.name}</span>
                      {place(market) ? (
                        <span className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400">
                          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                          {place(market)}
                        </span>
                      ) : null}
                    </span>
                    <RemoveButton label={`Remove ${market.name}`} onClick={() => setMarkets((all) => all.filter((other) => other.slug !== market.slug))} />
                  </li>
                ))}
              </ul>
            ) : null}
            {room > 0 ? (
              <MarketPicker
                label="Markets you sell at"
                hideLabel
                appliedSlugs={appliedSlugs}
                pickedSlugs={markets.map((market) => market.slug)}
                onPick={(market) => {
                  setMarkets((all) => (all.some((other) => other.slug === market.slug) ? all : [...all, market]));
                  setNotice(null);
                }}
              />
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">That is plenty to start with. You can add more markets later.</p>
            )}
          </div>
        </section>

        <StickyBar
          notice={notice}
          idle="A person checks every new page. Photos and the rest can wait."
          label="Send for review"
          busyLabel="Sending"
          busy={sending}
          disabled={done}
          onSubmit={submit}
        />
      </div>
    </FieldErrorsContext.Provider>
  );
}
