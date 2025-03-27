import { Card, CardContent } from "@/components/ui/card";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Farmer Markets - Our Mission and Values",
  description: "Learn about Farmer Markets' mission to support local agriculture and sustainable food systems. Discover how we connect consumers with local farmers and producers across the United States.",
  openGraph: {
    title: "About Farmer Markets - Our Mission and Values",
    description: "Learn about Farmer Markets' mission to support local agriculture and sustainable food systems. Discover how we connect consumers with local farmers and producers across the United States.",
  },
};

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Header Section */}
      <section className="w-full py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col gap-4">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              About Farmer Markets
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-[700px] md:text-xl">
              Farmer Markets is a platform dedicated to connecting consumers with local farmers and producers across the United States.
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="w-full py-8 md:py-12 bg-white dark:bg-zinc-900">
        <div className="w-full max-w-4xl mx-auto px-4 sm:px-6">
          <div className="prose max-w-none dark:prose-invert">
            <h2 className="text-2xl font-bold tracking-tight mb-4">Our Mission</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Our mission is to support local agriculture and sustainable food systems by making it easier for consumers to discover and access farmer markets in their communities and while traveling across the country.
            </p>
            
            <h2 className="text-2xl font-bold tracking-tight mt-12 mb-6">Why Farmer Markets Matter</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 my-6">
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="text-xl font-medium mb-2">Support Local Economy</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    When you shop at farmer markets, your money stays in the local economy, supporting small-scale farmers and producers.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="text-xl font-medium mb-2">Fresh & Seasonal</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Farmer markets offer the freshest produce, harvested at peak ripeness and sold directly from the farm to you.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="text-xl font-medium mb-2">Reduce Environmental Impact</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Locally grown food travels fewer miles, reducing carbon emissions and environmental impact.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h3 className="text-xl font-medium mb-2">Community Connection</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Farmer markets create spaces for community gathering and direct connections between producers and consumers.
                  </p>
                </CardContent>
              </Card>
            </div>

            <h2 className="text-2xl font-bold tracking-tight mt-12 mb-4">About Our Data</h2>
            <p className="text-zinc-600 dark:text-zinc-400">
              Our platform features comprehensive information about farmer markets across the United States, sourced from the <a href="https://www.usdalocalfoodportal.com" className="text-green-600 hover:text-green-700 underline">USDA Local Food Portal</a>. The data includes market locations, hours of operation, products offered, and detailed market information.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 mt-4">
              We regularly update our database to ensure accuracy and provide the most current information about local farmer markets, helping you find fresh, local produce and supporting local agriculture across the nation.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
} 