"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FarmerMarket } from '@/lib/api';
import { getMarketProducts, getMarketHours, getMarketPaymentMethods } from "@/lib/api";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

interface MarketCardProps {
  market: FarmerMarket;
}

export function MarketCard({ market }: MarketCardProps) {
  const products = getMarketProducts(market);
  const hours = getMarketHours(market);
  const paymentMethods = getMarketPaymentMethods(market);

  // Get location data
  const { address, city, state, country, country_code } = market;

  // Get the website from websites array
  const website = market.websites?.[0];
  const websiteHost = (() => {
    try {
      return website ? new URL(website).hostname : undefined;
    } catch {
      return undefined;
    }
  })();
  const marketType = market.organization_types?.find((type) => type !== 'Official government dataset');
  const analyticsProperties = {
    market_id: market.id,
    market_name: market.name.slice(0, 80),
    country: market.country,
    market_type: marketType,
    source_id: market.provenance?.source_id
  };

  // Format the street address and location
  const streetAddress = address;

  // Clean up city/state display (avoid duplicates like "California, California")
  const locationParts = [
    city,
    state,
    country_code === 'US' ? undefined : country
  ].filter((part, index, parts): part is string => (
    Boolean(part) && parts.findIndex((candidate) => candidate?.toLowerCase() === part?.toLowerCase()) === index
  ));
  const cityStateDisplay = locationParts.join(', ');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="line-clamp-1">{market.name}</CardTitle>
        <CardDescription>
          <div className="flex items-center justify-between">
            <span>{cityStateDisplay}</span>
            {market.distance !== undefined && market.distance !== Infinity && (
              <span className="text-xs text-green-600 dark:text-green-500 font-medium">
                {market.distance} mi
              </span>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-2 text-sm">
          {/* Address display - clean up leading commas and duplicates */}
          {streetAddress && streetAddress.trim() && streetAddress !== ', , ' && (
            <div className="text-muted-foreground">
              <p>{streetAddress.replace(/^[,\s]+/, '').replace(/\s*,\s*,\s*/g, ', ')}</p>
            </div>
          )}
          
          {hours && <p><span className="font-medium">Hours:</span> {hours}</p>}
          
          {/* Products section */}
          {products && products.length > 0 && (
            <div>
              <span className="font-medium">Products:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {products.slice(0, 4).map((product, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-muted">
                    {product}
                  </span>
                ))}
                {products.length > 4 && (
                  <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-muted">
                    +{products.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Payment Methods section */}
          {paymentMethods && paymentMethods.length > 0 && (
            <div>
              <span className="font-medium">Payment Methods:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {paymentMethods.slice(0, 3).map((method, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-muted">
                    {method}
                  </span>
                ))}
                {paymentMethods.length > 3 && (
                  <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-muted">
                    +{paymentMethods.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex justify-between w-full">
          <Link
            href={`/markets/${market.slug}`}
            passHref
            onClick={() => trackEvent('Market Detail Selected', analyticsProperties)}
          >
            <Button variant="outline">View Details</Button>
          </Link>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('Official Market Website Opened', {
                ...analyticsProperties,
                destination_host: websiteHost
              })}
            >
              <Button variant="ghost" size="sm">Visit Website</Button>
            </a>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
