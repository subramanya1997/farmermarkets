import { getMarketById } from "@/lib/data";
import { getMarketProducts, getMarketHours, getMarketAddress } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import ClientSingleMarketMap from "@/components/ClientSingleMarketMap";
import { Metadata } from "next";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

interface MarketDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: MarketDetailPageProps): Promise<Metadata> {
  const resolvedParams = await params;
  const market = await getMarketById(resolvedParams.id);
  
  if (!market) {
    return {
      title: 'Market Not Found',
      description: 'The requested farmer market could not be found.',
    };
  }

  const products = getMarketProducts(market);
  const productsList = products?.join(', ') || '';

  return {
    title: `${market.name} - Farmer Market in ${market.city}, ${market.state}`,
    description: `Visit ${market.name} in ${market.city}, ${market.state}. Find fresh ${productsList}. ${market.location_description || ''}`,
    openGraph: {
      title: `${market.name} - Farmer Market in ${market.city}, ${market.state}`,
      description: `Visit ${market.name} in ${market.city}, ${market.state}. Find fresh ${productsList}. ${market.location_description || ''}`,
    },
    alternates: {
      canonical: `https://farmermarkets.app/markets/${resolvedParams.id}`,
    },
  };
}

export default async function MarketDetailPage({ 
  params 
}: MarketDetailPageProps) {
  try {
    // Safely extract the ID
    const resolvedParams = await params;
    const id = resolvedParams?.id;
    
    if (!id) {
      console.error("Market ID is undefined");
      notFound();
    }
    
    const market = await getMarketById(id);

    if (!market) {
      console.error(`No market found with ID: ${id}`);
      notFound();
    }

    const products = getMarketProducts(market);
    const hours = getMarketHours(market);
    const address = getMarketAddress(market);
    
    // Get city/state from market data
    const city = market.city;
    const state = market.state;
    
    // Get coordinates from location object
    const latitude = market.location?.lat;
    const longitude = market.location?.lon;
    
    // Get website from websites array
    const website = market.websites?.[0];
    
    // Handle payment method flags
    const hasWic = market.wic === true;
    const hasSnap = market.snap === true;
    const hasFmnp = market.fmnp === true;
    const hasSfmnp = market.sfmnp === true;
    const hasCredit = market.payment_methods?.includes("Credit/Debit");

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': `https://farmermarkets.app/markets/${market.id}`,
      name: market.name,
      description: market.location_description || `${market.name} is a local farmer market in ${market.city}, ${market.state}.`,
      url: `https://farmermarkets.app/markets/${market.id}`,
      telephone: market.phone_numbers?.[0],
      email: market.emails?.[0],
      address: {
        '@type': 'PostalAddress',
        streetAddress: address,
        addressLocality: market.city,
        addressRegion: market.state,
        postalCode: market.zip_code,
        addressCountry: 'US'
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: market.location?.lat,
        longitude: market.location?.lon
      },
      openingHours: hours,
      paymentAccepted: [
        ...(hasCredit ? ['Credit Card'] : []),
        'Cash',
        ...(hasWic ? ['WIC'] : []),
        ...(hasSnap ? ['SNAP'] : []),
        ...(hasFmnp ? ['FMNP'] : []),
        ...(hasSfmnp ? ['SFMNP'] : [])
      ].join(', '),
      priceRange: '$$',
      image: '/market-image.jpg', // Add a default market image
      potentialAction: {
        '@type': 'ViewAction',
        target: `https://farmermarkets.com/markets/${market.id}`
      }
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
          {/* Header Section */}
          <section className="w-full py-6 sm:py-8 md:py-12 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:gap-4">
                <div className="mb-2 sm:mb-4">
                  <Link href="/markets">
                    <Button variant="ghost" className="pl-0 -ml-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200">
                      ← Back to Markets
                    </Button>
                  </Link>
                </div>
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  {market.name}
                </h1>
                <p className="text-base sm:text-lg md:text-xl text-zinc-600 dark:text-zinc-400">
                  {city && state ? `${city}, ${state}` : ''}
                </p>
              </div>
            </div>
          </section>

          {/* Content Section */}
          <section className="w-full py-6 sm:py-8 md:py-12 bg-white dark:bg-zinc-900">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                {/* Map section for mobile - shown at top */}
                <div className="lg:hidden">
                  <Card className="bg-white dark:bg-zinc-800">
                    <CardContent className="p-4">
                      <h2 className="text-xl font-semibold mb-4">Location</h2>
                      <div className="rounded-lg overflow-hidden">
                        <ClientSingleMarketMap market={market} height="250px" />
                      </div>
                      {latitude && longitude && (
                        <div className="mt-4">
                          <a 
                            href={`https://www.openstreetmap.org/directions?from=&to=${latitude}%2C${longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full block"
                          >
                            <Button className="w-full bg-green-600 hover:bg-green-700">Get Directions</Button>
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Main content */}
                <div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8">
                    <Card className="bg-white dark:bg-zinc-800">
                      <CardContent className="p-4">
                        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Location & Hours</h2>
                        <div className="space-y-2 text-sm sm:text-base">
                          {address && (
                            <p className="text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-900 dark:text-zinc-200">Address:</span><br className="sm:hidden" /> {address}
                            </p>
                          )}
                          {hours && (
                            <p className="text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-900 dark:text-zinc-200">Hours:</span><br className="sm:hidden" /> {hours}
                            </p>
                          )}
                          {website && (
                            <p className="text-zinc-600 dark:text-zinc-400">
                              <span className="font-medium text-zinc-900 dark:text-zinc-200">Website:</span>{" "}
                              <a
                                href={website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700 dark:text-green-500 dark:hover:text-green-400 hover:underline break-all"
                              >
                                Visit Website
                              </a>
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-white dark:bg-zinc-800">
                      <CardContent className="p-4">
                        <h2 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">Available Products</h2>
                        {products && products.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {products.map((product, index) => (
                              <span
                                key={index}
                                className="inline-flex items-center px-2 py-1 rounded-full text-xs sm:text-sm bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              >
                                {product}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-zinc-500 dark:text-zinc-400 text-sm">No product information available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="prose max-w-none dark:prose-invert">
                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-3 sm:mb-4">About This Market</h2>
                    <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                      {market.name} is a local farmer market located in {city || ''}, {state || ''}. 
                      Visitors can find a variety of fresh, locally-grown produce and artisanal goods.
                    </p>
                    
                    {/* Payment options */}
                    {(hasCredit || hasWic || hasSnap || hasFmnp || hasSfmnp) && (
                      <div className="mt-6 sm:mt-8">
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Payment Options</h3>
                        <ul className="list-none space-y-2 text-sm sm:text-base">
                          {hasCredit && (
                            <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              Credit Cards Accepted
                            </li>
                          )}
                          {hasWic && (
                            <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              WIC Accepted
                            </li>
                          )}
                          {hasSnap && (
                            <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              SNAP Accepted
                            </li>
                          )}
                          {hasFmnp && (
                            <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              Farmers&apos; Market Nutrition Program
                            </li>
                          )}
                          {hasSfmnp && (
                            <li className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              Senior Farmers&apos; Market Nutrition Program
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {market.location_description && (
                      <div className="mt-6 sm:mt-8">
                        <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-3 sm:mb-4">Location Description</h3>
                        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">{market.location_description}</p>
                      </div>
                    )}
                    
                    <p className="mt-6 sm:mt-8 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                      Supporting local farmers and producers is vital for sustainable communities. 
                      By shopping at {market.name}, you&apos;re helping to strengthen the local economy 
                      and reduce the environmental impact of food transportation.
                    </p>
                  </div>
                </div>

                {/* Map section for desktop - shown on side */}
                <div className="hidden lg:block">
                  <Card className="sticky top-24 bg-white dark:bg-zinc-800">
                    <CardContent className="p-4 sm:p-6">
                      <h2 className="text-xl font-semibold mb-4">Location</h2>
                      <div className="rounded-lg overflow-hidden">
                        <ClientSingleMarketMap market={market} height="300px" />
                      </div>
                      {latitude && longitude && (
                        <div className="mt-4">
                          <a 
                            href={`https://www.openstreetmap.org/directions?from=&to=${latitude}%2C${longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full block"
                          >
                            <Button className="w-full bg-green-600 hover:bg-green-700">Get Directions</Button>
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  } catch (error) {
    console.error('Error fetching market details:', error);
    
    // Return a more graceful error state
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Market Information Unavailable</h1>
        <p className="text-center max-w-md mb-6">
          We&apos;re experiencing some technical difficulties fetching the market details. 
          Please try again in a few moments.
        </p>
        <div className="flex gap-4">
          <Link href="/markets">
            <Button variant="outline">Back to Markets</Button>
          </Link>
          <Link href="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </div>
    );
  }
} 