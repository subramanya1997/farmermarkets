import Image from 'next/image';
import { clean } from '@/lib/geo';
import type { FarmerMarket } from '@/lib/api';

type Photo = NonNullable<FarmerMarket['photos']>[number];

/**
 * Photos the market's verified organizer uploaded and an admin approved.
 * A swipeable strip on phones, a lead photo with smaller ones beside it on
 * wider screens. Captions are the organizer's own words.
 */
export function MarketPhotos({ photos, marketName }: { photos?: Photo[]; marketName: string }) {
  const shown = (photos ?? []).slice(0, 12);
  if (shown.length === 0) return null;
  const altFor = (photo: Photo, index: number) => clean(photo.alt) || `${marketName}, photo ${index + 1}`;

  return (
    <section aria-labelledby="market-photos-heading" className="mb-6 sm:mb-8">
      <h2 id="market-photos-heading" className="sr-only">
        Photos of {marketName}
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 sm:pb-0">
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
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <Image
                    src={photo.url}
                    alt={altFor(photo, index)}
                    fill
                    sizes={lead ? '(min-width: 640px) 50vw, 85vw' : '(min-width: 640px) 25vw, 60vw'}
                    priority={lead}
                    className="object-cover"
                  />
                </div>
                {clean(photo.caption) && (
                  <figcaption className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{clean(photo.caption)}</figcaption>
                )}
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
