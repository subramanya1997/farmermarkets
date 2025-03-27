import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <section className="relative w-full py-12 md:py-24 lg:py-32 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col items-center space-y-6 text-center">
            <div className="space-y-3">
              <h1 className="text-6xl font-bold tracking-tighter bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                404
              </h1>
              <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
                Page Not Found
              </h2>
              <p className="mx-auto max-w-[700px] text-zinc-600 md:text-xl dark:text-zinc-400">
                The page you&apos;re looking for doesn&apos;t exist or has been moved.
              </p>
            </div>
            <div className="flex flex-col gap-2 min-[400px]:flex-row mt-4">
              <Link href="/">
                <Button className="px-8 bg-green-600 hover:bg-green-700">
                  <Home className="mr-2 h-4 w-4" />
                  Return Home
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
} 