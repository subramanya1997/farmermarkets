import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getMarketHours, getMarketProducts, type FarmerMarket } from '@/lib/api';
import { displayName } from '@/lib/seo';

interface MarketSummaryCardProps {
  market: FarmerMarket;
}

/**
 * Server-rendered market card for the crawlable index.
 *
 * Deliberately *not* `MarketCard`: that one is a client component, so every
 * card on a 48-card page would ship its whole record into the RSC payload and
 * mount JS purely to fire an analytics click event. This renders the same
 * information as plain HTML — the whole card is one `<a href="/markets/slug">`,
 * which is exactly the link a crawler needs to reach the detail page.
 */
export function MarketSummaryCard({ market }: MarketSummaryCardProps) {
  const hours = getMarketHours(market);
  const products = getMarketProducts(market).slice(0, 3);

  const locationParts = [
    market.city,
    market.state,
    market.country_code === 'US' ? undefined : market.country,
  ].filter((part, index, parts): part is string =>
    Boolean(part) &&
    parts.findIndex((candidate) => candidate?.toLowerCase() === part?.toLowerCase()) === index
  );

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <Link href={`/markets/${market.slug}`} className="flex h-full flex-col gap-4">
        <CardHeader>
          <CardTitle className="line-clamp-2 text-base">{displayName(market.name)}</CardTitle>
          {locationParts.length > 0 && (
            <p className="text-sm text-muted-foreground">{locationParts.join(', ')}</p>
          )}
        </CardHeader>
        <CardContent className="flex-1 space-y-2 text-sm">
          {hours && (
            <p className="line-clamp-2 text-muted-foreground">
              <span className="font-medium text-foreground">Hours:</span> {hours}
            </p>
          )}
          {products.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {products.map((product) => (
                <span
                  key={product}
                  className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs"
                >
                  {product}
                </span>
              ))}
            </div>
          )}
          <span className="inline-block pt-1 text-sm font-medium text-green-700 dark:text-green-500">
            View details
          </span>
        </CardContent>
      </Link>
    </Card>
  );
}
