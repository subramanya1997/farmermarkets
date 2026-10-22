import type { ComponentType } from 'react';
import {
  ArrowUpRight,
  Bike,
  CalendarCheck,
  CalendarDays,
  Dog,
  HandCoins,
  Info,
  SquareParking,
  TrainFront,
} from 'lucide-react';
import { citedSources } from '@/lib/cityGuide';
import type { CityGuide as CityGuideData } from '@/lib/cityGuideSchema';

interface CityGuideProps {
  guide: CityGuideData;
}

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

/** A glyph for a tip, picked from its label; the label itself is free text. */
const LABEL_ICONS: [RegExp, Icon][] = [
  [/parking/i, SquareParking],
  [/bike|cycl/i, Bike],
  [/bus|train|transit|subway|metro|light rail/i, TrainFront],
  [/snap|ebt|double|match|bucks|wic/i, HandCoins],
  [/dog|pet/i, Dog],
  [/winter|year|season|late|early|holiday|hours|open|night|day/i, CalendarDays],
];

function iconFor(label: string): Icon {
  return LABEL_ICONS.find(([pattern]) => pattern.test(label))?.[1] ?? Info;
}

const MONTH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-21" as "Oct 2026", or undefined for anything else. */
function checkedLabel(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : MONTH_YEAR.format(date);
}

/**
 * "Know before you go": a handful of short, sourced visitor tips for a city
 * (when markets run in winter, where to park, how SNAP is matched). One fact
 * per card; the source sits behind a small arrow link in the card's corner,
 * and the date the sources were read is a quiet chip by the heading. Renders
 * nothing for a guide with no tips.
 */
export function CityGuide({ guide }: CityGuideProps) {
  if (guide.tips.length === 0) return null;
  const checked = checkedLabel(guide.verified_at);

  return (
    <section aria-labelledby="city-guide-heading">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id="city-guide-heading" className="text-xl font-bold tracking-tight sm:text-2xl">
          Know before you go
        </h2>
        {checked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            <CalendarCheck aria-hidden className="h-3.5 w-3.5 text-green-700 dark:text-green-500" />
            Checked {checked}
          </span>
        )}
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {guide.tips.map((tip) => {
          const Glyph = iconFor(tip.label);
          return (
            <li
              key={tip.label}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <Glyph aria-hidden className="h-4 w-4 text-green-700 dark:text-green-500" />
                  {tip.label}
                </span>
                <span className="flex shrink-0 gap-1">
                  {citedSources(guide, tip.source_ids).map((source) => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Source: ${source.title}`}
                      aria-label={`Source: ${source.title} (opens in a new tab)`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-green-50 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400"
                    >
                      <ArrowUpRight aria-hidden className="h-4 w-4" />
                    </a>
                  ))}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">{tip.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
