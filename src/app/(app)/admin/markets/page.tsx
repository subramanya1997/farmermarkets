import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Store } from 'lucide-react';
import { adminEditedMarkets, requireAdmin } from '@/lib/organizer';
import { SECTION_LABELS } from '@/lib/listingEdits';
import { MarketSearch } from '@/components/admin/MarketSearch';
import { Muted, Panel, TimeAgo } from '@/components/admin/bits';
import { placeLabel } from '@/components/admin/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Markets',
  robots: { index: false, follow: false },
};

const SHOWN_SECTIONS = 3;

export default async function AdminMarketsPage() {
  await requireAdmin();
  const rows = await adminEditedMarkets();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="sr-only">Markets</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Find any market to edit it, or pick up one that already has edits or organizers.</p>
      </div>

      <section aria-label="Find a market" className="rounded-lg border bg-white p-4 dark:bg-zinc-900">
        <MarketSearch />
      </section>

      <Panel title={`Edited or managed (${rows.length})`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Store aria-hidden="true" className="size-7 text-zinc-400" />
            <p className="font-medium">No market has edits or organizers yet</p>
            <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
              Every market can still be edited. Search for it above, make your changes and publish. It will show up here afterwards.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500 dark:text-zinc-400">
                  <th scope="col" className="px-4 py-2 font-medium">Market</th>
                  <th scope="col" className="px-4 py-2 font-medium">Edited sections</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">Managers</th>
                  <th scope="col" className="px-4 py-2 font-medium">Last edited</th>
                  <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ market, updatedAt, sections, managers }) => {
                  const labels = sections.map((section) => SECTION_LABELS[section]);
                  const extra = labels.length - SHOWN_SECTIONS;
                  return (
                    <tr key={market.id} className="align-top hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                      <td className="max-w-72 px-4 py-2.5">
                        <Link href={`/admin/markets/${market.slug}`} className="block truncate font-medium hover:underline">
                          {market.name}
                        </Link>
                        <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{placeLabel(market) || 'No city on file'}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {labels.length === 0 ? (
                          <Muted>None</Muted>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {labels.slice(0, SHOWN_SECTIONS).map((label) => (
                              <span key={label} className="rounded border bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {label}
                              </span>
                            ))}
                            {extra > 0 ? (
                              <span className="px-1 py-0.5 text-xs text-zinc-500 dark:text-zinc-400" title={labels.slice(SHOWN_SECTIONS).join(', ')}>
                                +{extra} more
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{managers || <Muted>0</Muted>}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                        {updatedAt ? <TimeAgo date={updatedAt} /> : <Muted>Never</Muted>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/admin/markets/${market.slug}`}
                          className="inline-flex items-center gap-1 font-medium text-green-700 hover:underline dark:text-green-400"
                          aria-label={`Edit ${market.name}`}
                        >
                          Edit
                          <ArrowRight aria-hidden="true" className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
