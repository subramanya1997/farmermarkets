import type { ComponentType } from 'react';
import {
  Accessibility,
  Armchair,
  Baby,
  Banknote,
  Bike,
  CigaretteOff,
  CloudRain,
  CreditCard,
  Dog,
  GlassWater,
  Globe,
  HandCoins,
  Info,
  Music,
  PawPrint,
  Phone,
  ShoppingBag,
  ShoppingBasket,
  SquareParking,
  Sprout,
  Toilet,
  Truck,
  Umbrella,
  Wifi,
} from 'lucide-react';
import { OFFERS_PREVIEW_COUNT, type Offer, type OfferGroup, type OfferIcon } from '@/lib/marketOffers';
import { OffersDialog } from '@/components/OffersDialog';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

/** Product icons never reach this section; they fall back to the basket. */
const ICONS: Partial<Record<OfferIcon, Icon>> = {
  card: CreditCard,
  cash: Banknote,
  snap: HandCoins,
  benefit: HandCoins,
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
  parking: SquareParking,
  wifi: Wifi,
  shade: Umbrella,
  bag: ShoppingBag,
  csa: Sprout,
  delivery: Truck,
  online: Globe,
  phone: Phone,
  basket: ShoppingBasket,
};

function OfferRow({ offer }: { offer: Offer }) {
  const Glyph = ICONS[offer.icon] ?? ShoppingBasket;
  return (
    <li className="flex items-start gap-4 py-2.5">
      <Glyph
        aria-hidden
        className={`mt-0.5 h-6 w-6 shrink-0 ${offer.unavailable ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-800 dark:text-zinc-200'}`}
      />
      <span className="min-w-0">
        <span
          className={`block text-base ${offer.unavailable ? 'text-zinc-500 line-through dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}
        >
          {offer.unavailable && <span className="sr-only">Not available: </span>}
          {offer.label}
        </span>
        {offer.note && (
          <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{offer.note}</span>
        )}
      </span>
    </li>
  );
}

/**
 * "What this market offers": an icon and a label per amenity, house rule,
 * payment method and ordering option, two columns wide, the first ten shown
 * and the rest behind "Show all", grouped in the dialog. Unavailable items
 * sit at the end, struck through. Nothing renders for a record with none.
 *
 * Every row is in the server HTML, the dialog's included, so search engines
 * and answer engines read the full list without running script.
 */
export function MarketOffers({ offers }: { offers: Offer[] }) {
  if (!offers.length) return null;

  const available = offers.filter((offer) => !offer.unavailable);
  const preview = (available.length ? available : offers).slice(0, OFFERS_PREVIEW_COUNT);
  const groups = (['Amenities', 'Good to know', 'Payment', 'Ordering'] as OfferGroup[])
    .map((group) => ({ group, items: offers.filter((offer) => offer.group === group && !offer.unavailable) }))
    .filter((entry) => entry.items.length);
  const unavailable = offers.filter((offer) => offer.unavailable);

  return (
    <section className="mt-6 border-t border-zinc-200 pt-6 sm:mt-8 sm:pt-8 dark:border-zinc-800" aria-labelledby="market-offers-heading">
      <h2 id="market-offers-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">
        What this market offers
      </h2>
      <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {preview.map((offer) => (
          <OfferRow key={offer.label} offer={offer} />
        ))}
      </ul>
      {offers.length > preview.length && (
        <OffersDialog count={offers.length}>
          {groups.map(({ group, items }) => (
            <div key={group} className="border-b border-zinc-200 py-5 last:border-b-0 dark:border-zinc-800">
              <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">{group}</h3>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((offer) => (
                  <OfferRow key={offer.label} offer={offer} />
                ))}
              </ul>
            </div>
          ))}
          {unavailable.length > 0 && (
            <div className="py-5">
              <h3 className="mb-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">Not available</h3>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {unavailable.map((offer) => (
                  <OfferRow key={offer.label} offer={offer} />
                ))}
              </ul>
            </div>
          )}
        </OffersDialog>
      )}
    </section>
  );
}
