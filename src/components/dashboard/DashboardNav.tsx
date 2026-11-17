'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, LogOut, Menu, Sprout } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * One nav entry. Everything here crosses from a server layout into this
 * client component, so icons are rendered elements and matching is data,
 * not a function.
 */
export interface DashboardNavItem {
  href: string;
  label: string;
  /** A rendered lucide icon. Without one, the label's first letter stands in. */
  icon?: ReactNode;
  /** Active only on `href` itself. Otherwise `href` and anything below it. */
  exact?: boolean;
  /** More path prefixes that count as this item ("/admin/claims" for the review queue). */
  also?: string[];
  /** An amber count on the right, for things waiting on someone. */
  count?: number;
  /** A small amber dot on the right; the text is what screen readers hear. */
  dot?: string;
}

export interface DashboardNavGroup {
  /** Small heading over the group; the first group usually has none. */
  label?: string;
  items: DashboardNavItem[];
}

export interface DashboardNavProps {
  /** "Admin" or "Organizer": the brand line, the nav label and the menu names. */
  title: string;
  groups: DashboardNavGroup[];
  /** Below the divider: links out of the dashboard, like the public site. */
  links: DashboardNavItem[];
  email: string;
  /** A short link on the right of the phone bar, for the one thing that needs attention. */
  mobileLink?: { href: string; label: string; icon?: ReactNode };
}

function isActive(item: DashboardNavItem, path: string): boolean {
  if (item.exact) return path === item.href;
  return [item.href, ...(item.also ?? [])].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function Count({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 tabular-nums dark:bg-amber-900/40 dark:text-amber-200">
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <span className="ml-auto flex size-4 shrink-0 items-center justify-center" title={label}>
      <span aria-hidden="true" className="size-2 rounded-full bg-amber-500 dark:bg-amber-400" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={signOut}
      disabled={pending}
      className="h-8 w-full justify-start px-2 text-zinc-600 dark:text-zinc-400"
    >
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <LogOut aria-hidden="true" />}
      {pending ? 'Signing out' : 'Sign out'}
    </Button>
  );
}

function NavLink({ item, active, onNavigate }: { item: DashboardNavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-green-50 text-green-900 dark:bg-green-950/50 dark:text-green-100'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
      )}
    >
      {item.icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 [&_svg]:size-4',
            active ? 'text-green-700 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500',
          )}
        >
          {item.icon}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] leading-none font-semibold uppercase',
            active
              ? 'bg-green-700 text-white dark:bg-green-500 dark:text-zinc-950'
              : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300',
          )}
        >
          {item.label.trim().charAt(0)}
        </span>
      )}
      {/* Market names can be long; the full name shows on hover. */}
      <span className="min-w-0 truncate" title={item.icon ? undefined : item.label}>
        {item.label}
      </span>
      {item.count !== undefined ? <Count count={item.count} /> : null}
      {item.dot ? <Dot label={item.dot} /> : null}
    </Link>
  );
}

/** The links, the outside links and the account footer. Shared by the sidebar and the phone sheet. */
function NavBody({ title, groups, links, email, onNavigate }: DashboardNavProps & { onNavigate?: () => void }) {
  const path = usePathname() ?? '';
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-green-700 text-white">
          <Sprout aria-hidden="true" className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">{title}</span>
      </div>

      <nav aria-label={title} className="flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group, index) =>
          group.items.length > 0 ? (
            <div key={group.label ?? index} className={cn(index > 0 && 'mt-4')}>
              {group.label ? (
                <p className="px-2.5 pb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{group.label}</p>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(item, path)} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}

        {links.length > 0 ? (
          <>
            <div className="my-3 border-t" />
            <ul className="flex flex-col gap-0.5">
              {links.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={false} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="shrink-0 border-t px-2 py-3">
        <p className="truncate px-2 pb-1.5 text-xs text-zinc-500 dark:text-zinc-400" title={email}>
          {email}
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}

/** Fixed left column on large screens. */
export function DashboardSidebar(props: DashboardNavProps) {
  return (
    <aside className="hidden border-r bg-white lg:block dark:bg-zinc-900">
      <div className="sticky top-16 h-[calc(100vh-4rem)]">
        <NavBody {...props} />
      </div>
    </aside>
  );
}

/** A slim bar with the current page on phones and tablets; the menu opens as a sheet. */
export function DashboardMobileBar(props: DashboardNavProps) {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? '';
  const current = props.groups.flatMap((group) => group.items).find((item) => isActive(item, path));
  const area = props.title.toLowerCase();

  return (
    <div className="sticky top-16 z-30 flex h-12 items-center gap-2 border-b bg-white/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Open ${area} menu`}>
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">{props.title} menu</SheetTitle>
          <SheetDescription className="sr-only">Pages of the {area} area</SheetDescription>
          <NavBody {...props} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="min-w-0 truncate text-sm font-semibold">{current?.label ?? props.title}</span>
      {props.mobileLink ? (
        <Link
          href={props.mobileLink.href}
          className="ml-auto mr-2 inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 [&_svg]:size-3.5"
        >
          {props.mobileLink.icon ? <span aria-hidden="true" className="flex">{props.mobileLink.icon}</span> : null}
          {props.mobileLink.label}
        </Link>
      ) : null}
    </div>
  );
}
