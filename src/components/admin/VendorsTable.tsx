'use client';

import { useDeferredValue, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { SelectInput, TextInput } from '@/components/vendor/fields';
import { SOURCE_LABELS, VENDOR_STATUS_LABELS, VendorStatusPill, type VendorStatusKey } from './VendorStatus';

export interface VendorTableRow {
  id: string;
  name: string;
  email: string;
  status: VendorStatusKey;
  source: string;
  /** Relative join time, worked out on the server so it matches after hydration. */
  joined: string;
  joinedTitle: string;
  listed: string[];
  waiting: string[];
  documents: number;
}

type Filter = 'all' | VendorStatusKey;

const FILTER_OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All vendors' },
  ...(Object.keys(VENDOR_STATUS_LABELS) as VendorStatusKey[]).map((key) => ({ value: key as Filter, label: VENDOR_STATUS_LABELS[key] })),
];

const SHOWN = 3;

function matches(row: VendorTableRow, text: string): boolean {
  if (!text) return true;
  const haystack = [row.name, row.email, ...row.listed, ...row.waiting].join(' ').toLowerCase();
  return text
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function MarketNames({ names, empty = 'None' }: { names: string[]; empty?: string }) {
  if (names.length === 0) return <span className="text-zinc-400 dark:text-zinc-600">{empty}</span>;
  const extra = names.length - SHOWN;
  return (
    <span className="break-words">
      {names.slice(0, SHOWN).join(', ')}
      {extra > 0 ? <span className="text-zinc-500 dark:text-zinc-400">{` +${extra} more`}</span> : null}
    </span>
  );
}

/** Every vendor, with a status filter and a text filter. */
export function VendorsTable({ rows }: { rows: VendorTableRow[] }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Filter>('all');
  const text = useDeferredValue(query.trim());
  const visible = useMemo(
    () => rows.filter((row) => (status === 'all' || row.status === status) && matches(row, text)),
    [rows, status, text],
  );
  const filtering = Boolean(text) || status !== 'all';

  return (
    <section className="rounded-lg border bg-white dark:bg-zinc-900">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold">
          Vendors{' '}
          <span className="font-normal text-zinc-500 tabular-nums dark:text-zinc-400">
            {filtering ? `${visible.length} of ${rows.length}` : rows.length}
          </span>
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SelectInput<Filter>
            aria-label="Filter by status"
            value={status}
            onChange={(next) => setStatus(next ?? 'all')}
            options={FILTER_OPTIONS}
            className="sm:w-52 sm:data-[size=default]:h-9"
          />
          <div className="relative sm:w-72">
            <label htmlFor={inputId} className="sr-only">
              Filter vendors
            </label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-400" />
            <TextInput
              id={inputId}
              type="search"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, email or market"
              className="pl-8 sm:h-9"
            />
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {rows.length === 0 ? 'No vendors yet.' : 'No vendors match that filter.'}
        </p>
      ) : (
        <>
          <ul className="divide-y sm:hidden">
            {visible.map((row) => (
              <li key={row.id} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/admin/vendors/${row.id}`} className="min-w-0 font-medium break-words text-green-700 hover:underline dark:text-green-400">
                    {row.name}
                  </Link>
                  <VendorStatusPill status={row.status} />
                </div>
                <div className="break-all text-xs text-zinc-500 dark:text-zinc-400">{row.email}</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  Listed at: <MarketNames names={row.listed} />
                </div>
                {row.waiting.length > 0 ? (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    Waiting: <MarketNames names={row.waiting} />
                  </div>
                ) : null}
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {row.documents} {row.documents === 1 ? 'document' : 'documents'}, {SOURCE_LABELS[row.source] ?? row.source}, joined{' '}
                  <span title={row.joinedTitle}>{row.joined}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-zinc-500 dark:text-zinc-400">
                  <th scope="col" className="px-4 py-2 font-medium">Vendor</th>
                  <th scope="col" className="px-4 py-2 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2 font-medium">Listed at</th>
                  <th scope="col" className="px-4 py-2 font-medium">Waiting</th>
                  <th scope="col" className="px-4 py-2 font-medium">Documents</th>
                  <th scope="col" className="px-4 py-2 font-medium">Source</th>
                  <th scope="col" className="px-4 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="max-w-72 px-4 py-2.5">
                      <Link href={`/admin/vendors/${row.id}`} className="block truncate font-medium text-green-700 hover:underline dark:text-green-400">
                        {row.name}
                      </Link>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{row.email}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <VendorStatusPill status={row.status} />
                    </td>
                    <td className="max-w-60 px-4 py-2.5">
                      <MarketNames names={row.listed} />
                    </td>
                    <td className="max-w-60 px-4 py-2.5">
                      <MarketNames names={row.waiting} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.documents}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">{SOURCE_LABELS[row.source] ?? row.source}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                      <span title={row.joinedTitle}>{row.joined}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
