'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { clean } from '@/lib/geo';
import { shownMarketPhotos } from '@/lib/marketPhotos';
import type { FarmerMarket } from '@/lib/api';

type Photo = NonNullable<FarmerMarket['photos']>[number];

/** A horizontal drag at least this long (px) turns the photo. */
const SWIPE_MIN = 40;

/**
 * Photos the market's verified organizer uploaded and an admin approved.
 * A swipeable strip on phones, a lead photo with smaller ones beside it on
 * wider screens. Captions are the organizer's own words. Tapping a photo
 * opens it full size, where arrows, the keyboard or a swipe move through the
 * set.
 */
export function MarketPhotos({ photos, marketName }: { photos?: Photo[]; marketName: string }) {
  const shown = shownMarketPhotos(photos);
  const [open, setOpen] = useState<number | null>(null);
  const touchStart = useRef<number | null>(null);
  if (shown.length === 0) return null;

  const altFor = (photo: Photo, index: number) => clean(photo.alt) || `${marketName}, photo ${index + 1}`;
  const count = shown.length;
  const step = (delta: number) => setOpen((current) => (current === null ? current : (current + delta + count) % count));
  const current = open === null ? undefined : shown[open];

  return (
    <section aria-labelledby="market-photos-heading" className="mb-6 sm:mb-8">
      <h2 id="market-photos-heading" className="sr-only">
        Photos of {marketName}
      </h2>
      {/* Sized by the column, not its contents: on phones the strip's captions
          would otherwise add up to a minimum width wider than the screen. */}
      <ul className="-mx-4 flex snap-x [contain:inline-size] snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
        {shown.map((photo, index) => {
          const lead = index === 0;
          return (
            <li
              key={photo.url}
              className={
                lead
                  ? 'w-[85%] shrink-0 snap-start sm:col-span-2 sm:row-span-2 sm:w-auto'
                  : 'w-[60%] shrink-0 snap-start sm:w-auto'
              }
            >
              <figure className="h-full">
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  aria-label={`Open photo ${index + 1} of ${count}: ${altFor(photo, index)}`}
                  className="relative block aspect-[4/3] w-full cursor-zoom-in overflow-hidden rounded-lg bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 dark:bg-zinc-800"
                >
                  <Image
                    src={photo.url}
                    alt={altFor(photo, index)}
                    fill
                    sizes={lead ? '(min-width: 640px) 50vw, 85vw' : '(min-width: 640px) 25vw, 60vw'}
                    priority={lead}
                    className="object-cover transition-transform duration-300 hover:scale-[1.02]"
                  />
                </button>
                {clean(photo.caption) && (
                  <figcaption className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{clean(photo.caption)}</figcaption>
                )}
              </figure>
            </li>
          );
        })}
      </ul>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none border-0 bg-black p-0 text-white sm:h-[90vh] sm:w-[calc(100vw-4rem)] sm:max-w-6xl sm:rounded-xl [&>button:last-child]:z-20 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-full [&>button:last-child]:bg-black/50 [&>button:last-child]:opacity-100 [&>button:last-child]:top-3 [&>button:last-child]:right-3 [&>button:last-child_svg]:size-5"
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') step(1);
            if (event.key === 'ArrowLeft') step(-1);
          }}
        >
          <DialogTitle className="sr-only">Photos of {marketName}</DialogTitle>
          <DialogDescription className="sr-only">
            {current && open !== null ? altFor(current, open) : ''}
          </DialogDescription>
          {current && open !== null && (
            <>
              <div
                className="relative min-h-0 flex-1"
                onTouchStart={(event) => {
                  touchStart.current = event.touches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const start = touchStart.current;
                  const end = event.changedTouches[0]?.clientX;
                  touchStart.current = null;
                  if (start === null || end === undefined || Math.abs(end - start) < SWIPE_MIN) return;
                  step(end < start ? 1 : -1);
                }}
              >
                <Image
                  key={current.url}
                  src={current.url}
                  alt={altFor(current, open)}
                  fill
                  sizes="100vw"
                  priority
                  className="object-contain"
                />
                {count > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => step(-1)}
                      aria-label="Previous photo"
                      className="absolute top-1/2 left-2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
                    >
                      <ChevronLeft className="size-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => step(1)}
                      aria-label="Next photo"
                      className="absolute top-1/2 right-2 z-10 h-11 w-11 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/70 hover:text-white"
                    >
                      <ChevronRight className="size-6" />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-baseline justify-between gap-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
                <div className="min-w-0">
                  <p className="text-zinc-100">{altFor(current, open)}</p>
                  {clean(current.caption) && <p className="mt-0.5 text-xs text-zinc-400">{clean(current.caption)}</p>}
                </div>
                {count > 1 && (
                  <p className="shrink-0 tabular-nums text-zinc-400" aria-live="polite">
                    {open + 1} of {count}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
