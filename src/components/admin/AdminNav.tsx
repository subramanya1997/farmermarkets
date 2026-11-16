'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Inbox,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Sprout,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  showPending?: boolean;
};

const NAV: NavItem[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, match: (path) => path === '/admin' },
  {
    href: '/admin/review',
    label: 'Review queue',
    icon: Inbox,
    match: (path) => /^\/admin\/(review|claims|changes)(\/|$)/.test(path),
    showPending: true,
  },
  { href: '/admin/markets', label: 'Markets', icon: Store, match: (path) => path.startsWith('/admin/markets') },
  { href: '/admin/organizers', label: 'Organizers', icon: Users, match: (path) => path.startsWith('/admin/organizers') },
];

interface AdminNavProps {
  email: string;
  /** Claims, updates, photos and older requests waiting for a decision. */
  pending: number;
}

function PendingCount({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 tabular-nums dark:bg-amber-900/40 dark:text-amber-200',
        className,
      )}
    >
      {count}
      <span className="sr-only"> waiting</span>
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

/** The links, the site link and the account footer. Shared by the sidebar and the phone sheet. */
function NavBody({ email, pending, onNavigate }: AdminNavProps & { onNavigate?: () => void }) {
  const path = usePathname() ?? '';
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-green-700 text-white">
          <Sprout aria-hidden="true" className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Admin</span>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;
            return (
              <li key={item.href}>
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
                  <Icon
                    aria-hidden="true"
                    className={cn('size-4 shrink-0', active ? 'text-green-700 dark:text-green-400' : 'text-zinc-400 dark:text-zinc-500')}
                  />
                  {item.label}
                  {item.showPending ? <PendingCount count={pending} /> : null}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="my-3 border-t" />

        <Link
          href="/"
          onClick={onNavigate}
          className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          View site
        </Link>
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
export function AdminSidebar(props: AdminNavProps) {
  return (
    <aside className="hidden border-r bg-white lg:block dark:bg-zinc-900">
      <div className="sticky top-16 h-[calc(100vh-4rem)]">
        <NavBody {...props} />
      </div>
    </aside>
  );
}

/** A slim bar with the current section on phones and tablets; the menu opens as a sheet. */
export function AdminMobileBar(props: AdminNavProps) {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? '';
  const current = NAV.find((item) => item.match(path));

  return (
    <div className="sticky top-16 z-30 flex h-12 items-center gap-2 border-b bg-white/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-white/80 lg:hidden dark:bg-zinc-900/95 dark:supports-[backdrop-filter]:bg-zinc-900/80">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Open admin menu">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Admin menu</SheetTitle>
          <SheetDescription className="sr-only">Pages of the admin area</SheetDescription>
          <NavBody {...props} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <span className="text-sm font-semibold">{current?.label ?? 'Admin'}</span>
      {props.pending > 0 ? (
        <Link
          href="/admin/review"
          className="ml-auto mr-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          <Inbox aria-hidden="true" className="size-3.5" />
          {props.pending} waiting
        </Link>
      ) : null}
    </div>
  );
}
