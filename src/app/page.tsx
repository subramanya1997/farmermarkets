import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchMarkets } from "@/lib/api";
import { MarketCard } from "@/components/MarketCard";
import { ShoppingBasket, Truck, Calendar, MapPin, CreditCard, Leaf, Apple, Carrot, Beef, Fish, Milk, Cookie, Coffee, Flower, Sandwich } from "lucide-react";

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function Home() {
  // Get markets data
  try {
    const marketsData = await fetchMarkets({ limit: 100 });
    const markets = marketsData.data;
    
    // Get featured markets - we'll choose a few with good data
    const featuredMarkets = markets
      .filter(market => market.name && market.location?.lat && market.location?.lon)
      .slice(0, 3);

    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
        {/* Hero Section */}
        <section className="relative w-full py-8 sm:py-12 md:py-24 lg:py-32 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
              <div className="space-y-2 sm:space-y-3">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tighter bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                  Fresh from Farm to Your Table
                </h1>
                <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg lg:text-xl text-zinc-600 dark:text-zinc-400">
                  Discover and support local farmers markets in your area. Fresh produce, artisanal goods, and community connections.
                </p>
              </div>
              

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
                <Link href="/markets" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto px-4 sm:px-8 bg-green-600 hover:bg-green-700">
                    Find Markets Near Me
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="w-full py-8 sm:py-12 md:py-16 bg-white dark:bg-zinc-900">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-8 sm:mb-12">
              How to Find Your Local Market
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <MapPin className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg sm:text-xl">Choose Your Location</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Enter your location to find markets near you
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <Calendar className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg sm:text-xl">Pick Your Time</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  View market schedules and plan your visit
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="w-12 sm:w-16 h-12 sm:h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <ShoppingBasket className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg sm:text-xl">Shop Fresh & Local</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Support local farmers and artisans
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Categories Section */}
        <section className="w-full py-8 sm:py-12 md:py-16 bg-zinc-50 dark:bg-zinc-800">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-8 sm:mb-12">
              What You&apos;ll Find at Our Markets
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {[
                { 
                  icon: <Carrot className="w-6 h-6" />, 
                  label: "Fresh Produce"
                },
                { 
                  icon: <Apple className="w-6 h-6" />, 
                  label: "Fruits & Vegetables"
                },
                { 
                  icon: <Beef className="w-6 h-6" />, 
                  label: "Meats & Poultry"
                },
                { 
                  icon: <Fish className="w-6 h-6" />, 
                  label: "Seafood"
                },
                { 
                  icon: <Milk className="w-6 h-6" />, 
                  label: "Dairy & Eggs"
                },
                { 
                  icon: <Cookie className="w-6 h-6" />, 
                  label: "Baked Goods"
                },
                { 
                  icon: <Sandwich className="w-6 h-6" />, 
                  label: "Prepared Foods"
                },
                { 
                  icon: <Coffee className="w-6 h-6" />, 
                  label: "Beverages"
                },
                { 
                  icon: <Flower className="w-6 h-6" />, 
                  label: "Flowers & Plants"
                },
                { 
                  icon: <ShoppingBasket className="w-6 h-6" />, 
                  label: "Specialty Items"
                },
                { 
                  icon: <Leaf className="w-6 h-6" />, 
                  label: "Organic & Natural"
                },
                { 
                  icon: <CreditCard className="w-6 h-6" />, 
                  label: "Payment Options"
                }
              ].map((category, index) => (
                <Link 
                  key={index} 
                  href="/markets"
                  className="block"
                >
                  <div className="flex flex-col items-center p-3 sm:p-4 bg-white dark:bg-zinc-700 rounded-lg shadow-sm hover:shadow-md transition-all hover:scale-105 cursor-pointer">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2 sm:mb-3">
                      {category.icon}
                    </div>
                    <span className="text-xs sm:text-sm font-medium text-center">{category.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Markets Section */}
        <section className="w-full py-8 sm:py-12 md:py-16 bg-white dark:bg-zinc-900">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="flex flex-col items-center justify-center space-y-2 sm:space-y-4 text-center mb-8 sm:mb-12">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">Popular Markets Near You</h2>
              <p className="mx-auto max-w-[700px] text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                Discover highly-rated farmers markets in your area
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {featuredMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
            <div className="flex justify-center mt-6 sm:mt-8">
              <Link href="/markets" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto px-4 sm:px-8">
                  View All Markets
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="w-full py-8 sm:py-12 md:py-16 bg-green-50 dark:bg-green-900/20">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <Leaf className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                <h3 className="font-semibold text-base sm:text-lg">Fresh & Local</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Support local farmers and get the freshest produce
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <Truck className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                <h3 className="font-semibold text-base sm:text-lg">Farm to Table</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Reduce food miles and support sustainable practices
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <CreditCard className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                <h3 className="font-semibold text-base sm:text-lg">Easy Payments</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Most markets accept cards, cash, and mobile payments
                </p>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <ShoppingBasket className="w-6 sm:w-8 h-6 sm:h-8 text-green-600" />
                <h3 className="font-semibold text-base sm:text-lg">Variety</h3>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  From produce to crafts, find everything you&apos;ll need
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  } catch (error) {
    console.error('Error fetching markets for homepage:', error);
    
    // Return a more graceful error state
    return (
      <div className="flex flex-col min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Temporarily Unavailable</h1>
        <p className="text-center max-w-md mb-6">
          We&apos;re experiencing some technical difficulties fetching market data. 
          Please try again in a few moments.
        </p>
        <Link href="/">
          <Button>Refresh Page</Button>
        </Link>
      </div>
    );
  }
}
