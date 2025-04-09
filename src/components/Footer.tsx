import Link from "next/link";

export function Footer() {
  const navigation = {
    main: [
      { name: 'Discover', href: '/markets' },
      { name: 'About', href: '/about' },
    ],
    legal: [
      { name: 'Terms', href: '/terms' },
      { name: 'Privacy', href: '/privacy' },
    ],
  };

  return (
    <footer className="border-t bg-white dark:bg-zinc-950">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="flex flex-col gap-8">
          {/* Main navigation */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="col-span-2">
              <Link href="/" className="inline-block font-bold text-xl sm:text-2xl bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Farmer Markets
              </Link>
              <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400 max-w-xs">
                Connecting consumers with local farmers and producers across the United States.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Navigation</h3>
              <ul className="space-y-2">
                {navigation.main.map((item) => (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-3">Legal</h3>
              <ul className="space-y-2">
                {navigation.legal.map((item) => (
                  <li key={item.name}>
                    <Link 
                      href={item.href}
                      className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-green-600 dark:hover:text-green-500"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom section */}
          <div className="pt-8 border-t flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                &copy; {new Date().getFullYear()} Farmer Markets. All rights reserved.
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Built by <a href="https://subramanya.ai/" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">Subramanya N</a>
              </p>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Data sourced from the USDA Local Food Portal
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
} 