'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, Check, ChevronRight, ChevronsUpDown, LifeBuoy, Loader2, LogOut, Menu, Settings, Sprout } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

/** One of the signed-in areas, for the switcher at the top of the sidebar. */
export interface DashboardArea {
  href: string;
  label: string;
  current?: boolean;
}

export interface DashboardNavProps {
  /** "Admin" or "Organizer": the switcher, the breadcrumb and the menu names. */
  title: string;
  groups: DashboardNavGroup[];
  /** Pinned to the bottom of the sidebar, over the account row: Settings, Help. */
  footer: DashboardNavItem[];
  /** The areas this account can open. Only shown as a switch when there is more than one. */
  areas: DashboardArea[];
  user: { name: string; email: string };
  settingsHref: string;
  helpHref: string;
  /** A short link in the top bar on phones, for the one thing that needs attention. */
  mobileLink?: { href: string; label: string; icon?: ReactNode };
}

function isActive(item: DashboardNavItem, path: string): boolean {
  if (item.exact) return path === item.href;
  return [item.href, ...(item.also ?? [])].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function initials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0]?.[0] ?? email[0] ?? '?');
  return letters.toUpperCase();
}

function Count({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-900 tabular-nums dark:bg-amber-900/40 dark:text-amber-200">
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

function Dot({ label }: { label: string }) {
  return (
    <span className="ml-auto flex size-4 shrink-0 items-center justify-center" title={label}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-md bg-green-700 text-white shadow-xs ring-1 ring-green-900/10', className)}
    >
      <Sprout className="size-3.5" />
    </span>
  );
}

function Avatar({ name, email, className }: { name: string; email: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-semibold text-green-900 ring-1 ring-green-900/5 dark:bg-green-900/50 dark:text-green-100',
        className,
      )}
    >
      {initials(name, email)}
    </span>
  );
}

/** Top of the sidebar: the product and area, and a switch between areas (Linear and Vercel do the same). */
function AreaSwitcher({ title, areas }: { title: string; areas: DashboardArea[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left outline-none hover:bg-zinc-200/60 focus-visible:ring-2 focus-visible:ring-green-600 data-[state=open]:bg-zinc-200/60 dark:hover:bg-zinc-800 dark:data-[state=open]:bg-zinc-800">
        <BrandMark className="size-7" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">Farmer Markets</span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{title}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {areas.length > 1 ? (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-zinc-500 dark:text-zinc-400">Switch to</DropdownMenuLabel>
            <DropdownMenuGroup>
              {areas.map((area) => (
                <DropdownMenuItem key={area.href} asChild>
                  <Link href={area.href}>
                    <BrandMark className={cn('size-5', !area.current && 'bg-zinc-700')} />
                    {area.label}
                    {area.current ? <Check aria-label="Current" className="ml-auto text-green-700 dark:text-green-400" /> : null}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href="/">
            <ArrowUpRight />
            Go to farmermarkets.app
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SignOutItem() {
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
    <DropdownMenuItem
      onSelect={(event) => {
        // Keep the menu open on the spinner until the redirect lands.
        event.preventDefault();
        void signOut();
      }}
      disabled={pending}
    >
      {pending ? <Loader2 className="animate-spin" /> : <LogOut />}
      {pending ? 'Signing out' : 'Sign out'}
    </DropdownMenuItem>
  );
}

/** Bottom of the sidebar: who is signed in, with Settings, Help and Sign out behind it. */
function AccountMenu({ user, settingsHref, helpHref, onNavigate }: Pick<DashboardNavProps, 'user' | 'settingsHref' | 'helpHref'> & { onNavigate?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full min-w-0 items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-zinc-200/60 focus-visible:ring-2 focus-visible:ring-green-600 data-[state=open]:bg-zinc-200/60 dark:hover:bg-zinc-800 dark:data-[state=open]:bg-zinc-800">
        <Avatar name={user.name} email={user.email} className="size-7" />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-50">{user.name || user.email}</span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-zinc-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
          <Avatar name={user.name} email={user.email} className="size-8" />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{user.name || 'Your account'}</span>
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={settingsHref} onClick={onNavigate}>
              <Settings />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={helpHref} onClick={onNavigate}>
              <LifeBuoy />
              Help
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/">
              <ArrowUpRight />
              View public site
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <SignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({ item, active, onNavigate }: { item: DashboardNavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-green-600',
        active
          ? 'bg-white text-zinc-900 shadow-xs ring-1 ring-zinc-900/5 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-white/5'
          : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100',
      )}
    >
      {item.icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 [&_svg]:size-4',
            active ? 'text-green-700 dark:text-green-400' : 'text-zinc-400 group-hover:text-zinc-500 dark:text-zinc-500',
          )}
        >
          {item.icon}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded text-[10px] leading-none font-semibold uppercase',
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

function NavList({ items, path, onNavigate }: { items: DashboardNavItem[]; path: string; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-px">
      {items.map((item) => (
        <li key={item.href}>
          <NavLink item={item} active={isActive(item, path)} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  );
}

/** The whole sidebar. Shared by the large-screen column and the phone sheet. */
function NavBody({ title, groups, footer, areas, user, settingsHref, helpHref, onNavigate }: DashboardNavProps & { onNavigate?: () => void }) {
  const path = usePathname() ?? '';
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <AreaSwitcher title={title} areas={areas} />

      <nav aria-label={title} className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-2">
        {groups.map((group, index) =>
          group.items.length > 0 ? (
            <div key={group.label ?? index} className={cn(index > 0 && 'mt-5')}>
              {group.label ? (
                <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">{group.label}</p>
              ) : null}
              <NavList items={group.items} path={path} onNavigate={onNavigate} />
            </div>
          ) : null,
        )}
        {footer.length > 0 ? (
          <div className="mt-auto pt-5">
            <NavList items={footer} path={path} onNavigate={onNavigate} />
          </div>
        ) : null}
      </nav>

      <div className="border-t border-zinc-200/80 pt-2 dark:border-zinc-800">
        <AccountMenu user={user} settingsHref={settingsHref} helpHref={helpHref} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/** The left column on large screens, on the same grey as the canvas around the page. */
export function DashboardSidebar(props: DashboardNavProps) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <NavBody {...props} />
    </aside>
  );
}

/**
 * The bar at the top of the page panel: the menu button on phones, then
 * "Area > Page" with the page's icon, and Help and the public site on the
 * right.
 */
export function DashboardTopBar(props: DashboardNavProps) {
  const [open, setOpen] = useState(false);
  const path = usePathname() ?? '';
  const current = [...props.groups.flatMap((group) => group.items), ...props.footer].find((item) => isActive(item, path));
  const area = props.title.toLowerCase();
  const home = props.areas.find((item) => item.current)?.href;
  // On a page below a sidebar item (one market, one claim), the item's name
  // in the breadcrumb is the way back to it.
  const below = current && path !== current.href;
  const crumbLink = 'rounded-sm hover:text-zinc-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:hover:text-zinc-50';

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-2 sm:px-4 dark:border-zinc-800">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Open ${area} menu`} className="size-8 lg:hidden">
            <Menu aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" showClose={false} className="w-72 gap-0 bg-zinc-100 p-0 dark:bg-zinc-950">
          <SheetTitle className="sr-only">{props.title} menu</SheetTitle>
          <SheetDescription className="sr-only">Pages of the {area} area</SheetDescription>
          <NavBody {...props} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <li className="hidden shrink-0 text-zinc-500 sm:block dark:text-zinc-400">
            {home ? (
              <Link href={home} className={crumbLink}>
                {props.title}
              </Link>
            ) : (
              props.title
            )}
          </li>
          {current ? (
            <>
              <li aria-hidden="true" className="hidden sm:block">
                <ChevronRight className="size-3.5 text-zinc-300 dark:text-zinc-600" />
              </li>
              <li
                className="flex min-w-0 items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-50"
                aria-current={below ? undefined : 'page'}
              >
                {current.icon ? (
                  <span aria-hidden="true" className="flex shrink-0 text-zinc-400 [&_svg]:size-3.5">
                    {current.icon}
                  </span>
                ) : null}
                {below ? (
                  <Link href={current.href} className={cn('truncate', crumbLink)}>
                    {current.label}
                  </Link>
                ) : (
                  <span className="truncate">{current.label}</span>
                )}
              </li>
            </>
          ) : (
            <li className="font-medium text-zinc-900 sm:hidden dark:text-zinc-50">
              {home && path !== home ? (
                <Link href={home} className={crumbLink}>
                  {props.title}
                </Link>
              ) : (
                props.title
              )}
            </li>
          )}
        </ol>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {props.mobileLink ? (
          <Link
            href={props.mobileLink.href}
            className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 lg:hidden dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800 [&_svg]:size-3.5"
          >
            {props.mobileLink.icon ? <span aria-hidden="true" className="flex">{props.mobileLink.icon}</span> : null}
            {props.mobileLink.label}
          </Link>
        ) : null}
        <Button asChild variant="ghost" size="sm" className="hidden h-8 px-2.5 text-[13px] text-zinc-600 sm:inline-flex dark:text-zinc-400">
          <Link href={props.helpHref}>
            <LifeBuoy aria-hidden="true" />
            Help
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5 text-[13px]">
          <Link href="/">
            View site
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
