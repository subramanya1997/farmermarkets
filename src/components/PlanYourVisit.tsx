import type { ComponentType, ReactNode } from 'react';
import {
  Accessibility,
  ArrowUpRight,
  Armchair,
  Baby,
  BadgePercent,
  Banknote,
  Beef,
  Bike,
  CalendarCheck,
  ChevronDown,
  CigaretteOff,
  CloudRain,
  CreditCard,
  Croissant,
  Dog,
  Egg,
  Fish,
  Flower2,
  GlassWater,
  HandCoins,
  Hexagon,
  Info,
  Leaf,
  Milk,
  Music,
  Package,
  Palette,
  PawPrint,
  ShoppingBasket,
  Sprout,
  SquareParking,
  Store,
  Toilet,
  TrainFront,
  UtensilsCrossed,
  Wine,
  Carrot,
} from 'lucide-react';
import type { AnalyticsProperties } from '@/lib/analytics';
import type { OpenStatusInput } from '@/lib/openStatus';
import type { Chip, ChipIcon, PlanVisitView, Tile } from '@/lib/planVisitView';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';
import { MarketOpenStatus } from '@/components/MarketOpenStatus';
import { WeekHours } from '@/components/WeekHours';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const CHIP_ICONS: Record<ChipIcon, Icon> = {
  card: CreditCard,
  cash: Banknote,
  snap: HandCoins,
  benefit: HandCoins,
  produce: Carrot,
  meat: Beef,
  fish: Fish,
  dairy: Milk,
  eggs: Egg,
  bread: Croissant,
  flowers: Flower2,
  honey: Hexagon,
  jar: Package,
  wine: Wine,
  craft: Palette,
  food: UtensilsCrossed,
  herbs: Sprout,
  basket: ShoppingBasket,
  accessible: Accessibility,
  dog: Dog,
  'no-dog': PawPrint,
  'no-smoking': CigaretteOff,
  restroom: Toilet,
  seating: Armchair,
  music: Music,
  kids: Baby,
  info: Info,
  atm: Banknote,
  water: GlassWater,
  bike: Bike,
  rain: CloudRain,
};

const TILE_META: Record<Tile['key'], { label: string; icon: Icon }> = {
  parking: { label: 'Parking', icon: SquareParking },
  transit: { label: 'Transit', icon: TrainFront },
  vendors: { label: 'Vendors', icon: Store },
};

interface PlanYourVisitProps {
  view: PlanVisitView;
  timezone?: string;
  openStatus?: OpenStatusInput;
  analyticsProperties: AnalyticsProperties;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return undefined;
  }
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </h3>
  );
}

function ChipList({ chips, tone = 'plain' }: { chips: Chip[]; tone?: 'plain' | 'soft' }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => {
        const Glyph = CHIP_ICONS[chip.icon];
        return (
          <li
            key={chip.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
              tone === 'soft'
                ? 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200'
                : 'border border-zinc-200 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
            }`}
          >
            <Glyph aria-hidden className="h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
            {chip.label}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The visit card at the top of a well-documented market page.
 *
 * Built to be scanned, not read: the week as a grid, a word or a number per
 * tile, lists as chips, and the source sentences folded into "More details"
 * so nothing is lost. Every part is optional and simply absent when the
 * record cannot fill it; the caller only renders the card for records with a
 * hand-checked schedule (see `planVisitSummary`).
 */
export function PlanYourVisit({ view, timezone, openStatus, analyticsProperties }: PlanYourVisitProps) {
  const link = (href: string, label: string, row: string, className: string, children: ReactNode) => (
    <TrackedExternalLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      eventName="Plan Visit Link Opened"
      eventProperties={{ ...analyticsProperties, row, destination_host: hostOf(href), label }}
    >
      {children}
    </TrackedExternalLink>
  );

  const hasHours = Boolean(view.week?.length || view.scheduleLines.length);
  const hasPay = view.pay.length > 0 || view.perks.length > 0;
  const sections = [
    hasHours,
    view.tiles.length > 0,
    hasPay,
    view.products.length > 0,
    view.rules.length > 0,
  ].filter(Boolean).length;
  if (sections < 2) return null;

  return (
    <section className="mb-8 sm:mb-10" aria-labelledby="plan-visit-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="plan-visit-heading" className="text-lg font-semibold tracking-tight sm:text-xl">
          Plan your visit
        </h2>
        {openStatus && <MarketOpenStatus input={openStatus} />}
      </div>

      <div className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {hasHours && (
          <div className="p-4 sm:p-5">
            <SectionLabel>Hours</SectionLabel>
            {view.week?.length ? (
              <>
                <WeekHours rows={view.week} timezone={timezone} />
                {view.otherSchedules.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {view.otherSchedules.map((line) => {
                      const [label, ...rest] = line.split(': ');
                      return (
                        <li key={line}>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
                          {rest.length > 0 && <span className="tabular-nums"> {rest.join(': ')}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <ul className="space-y-1 text-sm text-zinc-800 dark:text-zinc-200">
                {view.scheduleLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {(view.badges.length > 0 || view.upcoming.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {view.badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-900 dark:bg-green-950/40 dark:text-green-200"
                  >
                    {/rain/i.test(badge) ? (
                      <CloudRain aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <CalendarCheck aria-hidden className="h-3.5 w-3.5" />
                    )}
                    {badge}
                  </span>
                ))}
                {view.upcoming.map((chip) => (
                  <span
                    key={`${chip.date}-${chip.value}`}
                    title={chip.label}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${
                      chip.closed
                        ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                        : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    <span className="font-semibold">{chip.date}</span>
                    {chip.value}
                    {chip.label && !chip.closed && (
                      <span className="hidden opacity-75 sm:inline">{chip.label}</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {view.tiles.length > 0 && (
          <ul
            className={`grid divide-x divide-zinc-200 dark:divide-zinc-800 ${
              view.tiles.length === 1 ? 'grid-cols-1' : view.tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {view.tiles.map((tile) => {
              const meta = TILE_META[tile.key];
              const Glyph = meta.icon;
              return (
                <li key={tile.key} className="min-w-0 p-4 sm:p-5">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <Glyph aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
                    {meta.label}
                  </p>
                  <p className="mt-1.5 text-base font-semibold leading-snug tracking-tight text-zinc-900 sm:text-lg dark:text-zinc-50">
                    {tile.headline}
                  </p>
                  {tile.caption && (
                    <p className="text-xs text-zinc-500 sm:text-sm dark:text-zinc-400">{tile.caption}</p>
                  )}
                  {tile.href &&
                    link(
                      tile.href,
                      tile.hrefLabel ?? 'More',
                      tile.key,
                      'mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-green-700 hover:underline sm:text-sm dark:text-green-500',
                      <>
                        {tile.hrefLabel}
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </>
                    )}
                  {tile.extraHref &&
                    link(
                      tile.extraHref,
                      tile.extraLabel ?? 'More',
                      tile.key,
                      'mt-1 flex items-center gap-0.5 text-xs font-medium text-green-700 hover:underline sm:text-sm dark:text-green-500',
                      <>
                        {tile.extraLabel}
                        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                      </>
                    )}
                </li>
              );
            })}
          </ul>
        )}

        {hasPay && (
          <div className="p-4 sm:p-5">
            <SectionLabel>Pay with</SectionLabel>
            {view.pay.length > 0 && <ChipList chips={view.pay} />}
            {view.perks.length > 0 && (
              <ul className="mt-3 space-y-2">
                {view.perks.map((perk) => (
                  <li
                    key={perk.name}
                    className="flex items-center gap-3 rounded-xl bg-lime-50 px-3 py-2.5 dark:bg-lime-950/30"
                  >
                    <BadgePercent aria-hidden className="h-5 w-5 shrink-0 text-lime-700 dark:text-lime-400" />
                    <p className="min-w-0 text-sm text-zinc-800 dark:text-zinc-200">
                      <span className="font-semibold">{perk.name}</span>
                      {perk.value && (
                        <>
                          {' '}
                          <span className="font-semibold text-lime-800 dark:text-lime-300">{perk.value}</span>
                        </>
                      )}
                      {perk.limit && <span className="text-zinc-600 dark:text-zinc-400">, {perk.limit}</span>}
                    </p>
                    {perk.href &&
                      link(
                        perk.href,
                        perk.name,
                        'paying',
                        'ml-auto shrink-0 text-green-700 hover:text-green-900 dark:text-green-500',
                        <>
                          <ArrowUpRight aria-hidden className="h-4 w-4" />
                          <span className="sr-only">About {perk.name}</span>
                        </>
                      )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {view.products.length > 0 && (
          <div className="p-4 sm:p-5">
            <SectionLabel>What you will find</SectionLabel>
            <ChipList chips={view.products} tone="soft" />
            {view.inSeason && (
              <p className="mt-3 flex gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <Leaf aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-green-700 dark:text-green-500" />
                <span>{view.inSeason}</span>
              </p>
            )}
          </div>
        )}

        {view.rules.length > 0 && (
          <div className="p-4 sm:p-5">
            <SectionLabel>Good to know</SectionLabel>
            <ChipList chips={view.rules} />
          </div>
        )}

        {view.details.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:px-5 dark:text-zinc-300 dark:hover:bg-zinc-800/60 [&::-webkit-details-marker]:hidden">
              More details
              <ChevronDown
                aria-hidden
                className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <dl className="space-y-2.5 px-4 pb-4 text-sm sm:px-5">
              {view.details.map((line) => (
                <div key={`${line.term}:${line.text}`} className="sm:flex sm:gap-4">
                  <dt className="shrink-0 font-medium text-zinc-900 sm:w-32 dark:text-zinc-100">{line.term}</dt>
                  <dd className="text-zinc-600 dark:text-zinc-400">
                    {line.text}
                    {line.href && (
                      <>
                        {' '}
                        {link(
                          line.href,
                          line.term,
                          'details',
                          'whitespace-nowrap font-medium text-green-700 hover:underline dark:text-green-500',
                          'Source'
                        )}
                      </>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </section>
  );
}
