'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatusPill } from './bits';

export interface OrganizerRow {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  admin: boolean;
  /** Relative join time, worked out on the server so it matches after hydration. */
  joined: string;
  joinedTitle: string;
  manages: { slug: string; name: string; place: string }[];
  claims: { id: string; status: string; market: { slug: string; name: string } | null }[];
}

function matches(row: OrganizerRow, text: string): boolean {
  if (!text) return true;
  const haystack = [row.name, row.email, ...row.manages.map((m) => m.name), ...row.claims.map((c) => c.market?.name ?? '')]
    .join(' ')
    .toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/** Every account, with a filter that matches name, email and market names. */
export function OrganizersTable({ rows }: { rows: OrganizerRow[] }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const text = useDeferredValue(query.trim());
  const visible = useMemo(() => rows.filter((row) => matches(row, text)), [rows, text]);

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Accounts{' '}
          <span className="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
            {text ? `${visible.length} of ${rows.length}` : rows.length}
          </span>
        </h2>
        <div className="relative w-full sm:w-72">
          <label htmlFor={inputId} className="sr-only">
            Filter accounts
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            id={inputId}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, email or market"
            className="h-8 pl-8"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {rows.length === 0 ? 'Nobody has signed up yet.' : 'No accounts match that filter.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-500 dark:text-zinc-400">
                <th scope="col" className="px-4 py-2 font-medium">Account</th>
                <th scope="col" className="px-4 py-2 font-medium">Joined</th>
                <th scope="col" className="px-4 py-2 font-medium">Manages</th>
                <th scope="col" className="px-4 py-2 font-medium">Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="max-w-80 px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium">{row.name || 'No name'}</span>
                      {row.admin ? <Tag tone="admin">Admin</Tag> : null}
                      {row.verified ? <Tag tone="verified">Verified</Tag> : <Tag tone="muted">Not verified</Tag>}
                    </div>
                    <a href={`mailto:${row.email}`} className="block truncate text-xs text-zinc-500 hover:underline dark:text-zinc-400">
                      {row.email}
                    </a>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                    <span title={row.joinedTitle}>{row.joined}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.manages.length === 0 ? (
                      <span className="text-zinc-400 dark:text-zinc-600">None</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {row.manages.map((market) => (
                          <li key={market.slug} className="truncate">
                            <Link href={`/admin/markets/${market.slug}`} className="text-green-700 hover:underline dark:text-green-400">
                              {market.name}
                            </Link>
                            {market.place ? <span className="text-xs text-zinc-500 dark:text-zinc-400"> {market.place}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.claims.length === 0 ? (
                      <span className="text-zinc-400 dark:text-zinc-600">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.claims.map((claim) => (
                          <li key={claim.id} className="flex min-w-0 items-center gap-2">
                            <StatusPill status={claim.status} />
                            <Link href={`/admin/claims/${claim.id}`} className="truncate hover:underline">
                              {claim.market?.name ?? 'Unknown market'}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const TAG_TONES = {
  admin: 'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700/60 dark:bg-violet-900/30 dark:text-violet-200',
  verified: 'border-green-300 bg-green-50 text-green-800 dark:border-green-700/60 dark:bg-green-900/30 dark:text-green-200',
  muted: 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
} as const;

function Tag({ tone, children }: { tone: keyof typeof TAG_TONES; children: string }) {
  return <span className={`inline-flex rounded-md border px-1.5 py-px text-[11px] font-medium ${TAG_TONES[tone]}`}>{children}</span>;
}
