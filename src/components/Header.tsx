"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties } from "react";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  CreditCard,
  Info,
  Mail,
  MapPin,
  Menu,
  Search,
  ShoppingBag,
  Store,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { trackEvent } from "@/lib/analytics";
import { displaySerif } from "@/lib/fonts";
import { SITE_FRAME } from "@/lib/ui";

interface HeaderProps {
  /** The biggest state hubs, for the mobile menu. */
  states: { name: string; href: string; marketCount: number }[];
  /** The topic pages (SNAP/EBT, Saturday, ...), for the mobile menu. */
  topics: { slug: string; label: string; href: string }[];
}

// Discover lives in the footer's Site column: the homepage IS the discovery
// experience, so a header link to /markets would be a duplicate.
const DESKTOP_NAV = [
  { name: "Blog", href: "/blog" },
  { name: "About", href: "/about" },
];

const MENU_NAV: { name: string; hint: string; href: string; icon: LucideIcon }[] = [
  { name: "Find a market", hint: "Search 9,000+ markets near you", href: "/", icon: MapPin },
  { name: "Blog", hint: "Guides for shopping, storing, selling", href: "/blog", icon: BookOpen },
  { name: "For market operators", hint: "Claim or add your listing", href: "/for-market-operators", icon: Store },
  { name: "About", hint: "Who we are and our data sources", href: "/about", icon: Info },
];

const TOPIC_ICONS: Record<string, LucideIcon> = {
  "snap-ebt": CreditCard,
  online: ShoppingBag,
  hours: Clock,
  saturday: CalendarDays,
};

/** Stagger index for a menu row's entrance (see `.menu-rise` in globals.css). */
function rise(index: number): CSSProperties {
  return { "--nl-i": index } as CSSProperties;
}

export function Header({ states, topics }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const go = (destination: string) => {
    setIsOpen(false);
    trackEvent("Navigation Selected", { destination, location: "mobile_menu" });
  };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  let row = 0;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:bg-zinc-950/60">
      <div className={SITE_FRAME}>
        <div className="flex h-16 items-center justify-between">
          <Link
            href="/"
            onClick={() => trackEvent("Navigation Selected", { destination: "home", location: "header_logo" })}
            className="font-bold text-xl sm:text-2xl bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent"
          >
            Farmer Markets
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-4">
            {DESKTOP_NAV.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => trackEvent("Navigation Selected", { destination: item.href, location: "desktop_header" })}
              >
                <Button variant="ghost" className="hover:text-green-600">
                  {item.name}
                </Button>
              </Link>
            ))}
          </nav>

          {/* Mobile menu */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="hover:text-green-600">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Open menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              showClose={false}
              className="w-full gap-0 overflow-y-auto border-l-0 bg-zinc-50 p-0 sm:max-w-sm dark:bg-zinc-950"
            >
              {/* Top bar. Below `sm` the panel is full width and covers the
                  page header, so it carries the brand; wider, the page's own
                  logo stays visible beside the panel and a quiet label is
                  enough. */}
              <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 bg-white/90 px-5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <span aria-hidden="true" className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-xl font-bold text-transparent sm:hidden">
                  Farmer Markets
                </span>
                <span aria-hidden="true" className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:block dark:text-zinc-400">
                  Menu
                </span>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
                <SheetClose className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close menu</span>
                </SheetClose>
              </div>

              <div className="flex flex-col gap-7 px-5 pb-10 pt-5">
                {/* Search shortcut: the explorer on the homepage. */}
                <Link
                  href="/"
                  onClick={() => go("/")}
                  className="menu-rise flex h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 text-[15px] text-zinc-500 shadow-sm transition-colors hover:border-green-600/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
                  style={rise(row++)}
                >
                  <Search aria-hidden="true" className="h-4 w-4 text-green-700 dark:text-green-400" />
                  Search markets by name or place
                </Link>

                <nav aria-label="Main">
                  <ul className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    {MENU_NAV.map(({ name, hint, href, icon: Icon }) => {
                      const active = isActive(href);
                      return (
                        <li key={href} className="menu-rise border-b border-zinc-100 last:border-b-0 dark:border-zinc-800" style={rise(row++)}>
                          <Link
                            href={href}
                            onClick={() => go(href)}
                            aria-current={active ? "page" : undefined}
                            className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-green-50/70 dark:hover:bg-green-900/20"
                          >
                            <span
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                active
                                  ? "bg-green-700 text-white"
                                  : "bg-green-50 text-green-700 group-hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                              }`}
                            >
                              <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-zinc-900 dark:text-zinc-50">{name}</span>
                              <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{hint}</span>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className="h-4 w-4 shrink-0 text-zinc-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-green-600 dark:text-zinc-600"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </nav>

                <section aria-labelledby="menu-topics">
                  <h2 id="menu-topics" className="menu-rise mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400" style={rise(row++)}>
                    Browse by what you need
                  </h2>
                  <ul className="grid grid-cols-2 gap-2">
                    {topics.map(({ slug, label, href }) => {
                      const Icon = TOPIC_ICONS[slug] ?? MapPin;
                      return (
                        <li key={slug} className="menu-rise" style={rise(row++)}>
                          <Link
                            href={href}
                            onClick={() => go(href)}
                            className="flex h-full items-start gap-2.5 rounded-xl border border-zinc-200 bg-white p-3 text-sm font-medium leading-snug text-zinc-800 transition-colors hover:border-green-600/40 hover:bg-green-50/60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-green-900/20"
                          >
                            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-400" />
                            {label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                {states.length > 0 && (
                  <section aria-labelledby="menu-states">
                    <h2 id="menu-states" className="menu-rise mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400" style={rise(row++)}>
                      Popular states
                    </h2>
                    <ul className="flex flex-wrap gap-2">
                      {states.map(({ name, href, marketCount }) => (
                        <li key={href} className="menu-rise" style={rise(row++)}>
                          <Link
                            href={href}
                            onClick={() => go(href)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-sm text-zinc-800 transition-colors hover:border-green-600/40 hover:text-green-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-green-300"
                          >
                            {name}
                            <span className="text-xs text-zinc-400">{marketCount.toLocaleString()}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Newsletter prompt; the full form is the band on the homepage. */}
                <Link
                  href="/#newsletter"
                  onClick={() => go("/#newsletter")}
                  className="menu-rise group relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-900 to-emerald-700 p-5 text-white"
                  style={rise(row++)}
                >
                  <Mail aria-hidden="true" className="absolute -right-3 -top-3 h-24 w-24 rotate-12 text-white/10" strokeWidth={1.25} />
                  <p className={`${displaySerif.className} text-xl font-semibold tracking-tight`}>Never miss market day</p>
                  <p className="mt-1 text-sm text-green-50/80">Markets near you and what&apos;s in season, once a week at most.</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-lime-300 px-3.5 py-2 text-sm font-semibold text-green-950 transition-colors group-hover:bg-lime-200">
                    Get the market note
                    <ChevronRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
