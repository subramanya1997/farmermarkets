"use client";

import { useSyncExternalStore } from "react";
import type { WeekRow } from "@/lib/planVisitView";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Monday-first index of today in the market's own timezone. */
function todayIndex(timezone?: string): number | undefined {
  try {
    const name = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date());
    const index = DAY_NAMES.indexOf(name);
    return index >= 0 ? index : undefined;
  } catch {
    return undefined;
  }
}

function noopSubscribe() {
  return () => {};
}

/**
 * The opening week as a grid: one column per day, open days filled with
 * their hours, today outlined once the visitor's clock is known. The static
 * HTML carries no "today", so a cached page is never wrong about it.
 */
export function WeekHours({ rows, timezone }: { rows: WeekRow[]; timezone?: string }) {
  // Server render and hydration see no "today"; the browser fills it in.
  const today = useSyncExternalStore(
    noopSubscribe,
    () => todayIndex(timezone),
    () => undefined
  );
  const labelled = rows.length > 1 || Boolean(rows[0]?.label);

  return (
    <div className="space-y-3">
      {rows.map((row, rowIndex) => (
        <div key={row.label ?? rowIndex}>
          {labelled && row.label && (
            <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {row.label[0].toUpperCase() + row.label.slice(1)}
            </p>
          )}
          <ol className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {row.days.map((hours, index) => {
              const isToday = today === index;
              return (
                <li
                  key={DAY_LABELS[index]}
                  className={`flex min-h-[4.25rem] flex-col items-center rounded-lg px-0.5 py-2 text-center ${
                    hours
                      ? "bg-green-50 text-green-950 dark:bg-green-950/40 dark:text-green-100"
                      : "bg-zinc-50 text-zinc-400 dark:bg-zinc-800/50 dark:text-zinc-500"
                  } ${isToday ? "ring-2 ring-green-600 dark:ring-green-500" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      hours ? "text-green-800 dark:text-green-300" : ""
                    }`}
                  >
                    {DAY_LABELS[index]}
                  </span>
                  {hours ? (
                    <span aria-hidden="true" className="mt-1 text-[11px] leading-tight tabular-nums sm:text-xs">
                      {hours.opens}
                      <br />
                      {hours.closes}
                    </span>
                  ) : (
                    <span aria-hidden="true" className="mt-2 text-[11px]">Closed</span>
                  )}
                  <span className="sr-only">
                    {DAY_NAMES[index]}: {hours ? `${hours.opens} to ${hours.closes}` : "closed"}
                    {isToday ? " (today)" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}
