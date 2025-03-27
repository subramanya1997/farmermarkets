import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FarmerMarket } from '@/lib/api';
import { getMarketProducts, getMarketHours, getMarketPaymentMethods } from "@/lib/api";
import Link from "next/link";

interface MarketCardProps {
  market: FarmerMarket;
}

export function MarketCard({ market }: MarketCardProps) {
  const products = getMarketProducts(market);
  const hours = getMarketHours(market);
  const paymentMethods = getMarketPaymentMethods(market);

  // Get location data
  const { address, city, state } = market;

  // Get the website from websites array
  const website = market.websites?.[0];

  // Format the street address and location
  const streetAddress = address;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="line-clamp-1">{market.name}</CardTitle>
        <CardDescription>
          {city && state ? `${city}, ${state}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-2 text-sm">
          {/* Address display */}
          {streetAddress && (
            <div className="text-muted-foreground">
              {streetAddress && <p>{streetAddress}</p>}
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
          <Link href={`/markets/${market.id}`} passHref>
            <Button variant="outline">View Details</Button>
          </Link>
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm">Visit Website</Button>
            </a>
          )}
        </div>
      </CardFooter>
    </Card>
  );
} 