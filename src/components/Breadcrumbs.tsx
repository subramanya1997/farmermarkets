import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { absoluteUrl } from '@/lib/site';

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  /** The trail *below* Home, which this component always prepends itself. */
  items: BreadcrumbItem[];
  /**
   * How many of `items` to show on screen. The JSON-LD always carries the
   * full trail; this only trims the visible one, for pages whose H1 sits
   * right under the breadcrumb and would otherwise be repeated. When the
   * trail is cut short, its last visible crumb stays a link.
   */
  visible?: number;
}

/**
 * The site's one breadcrumb format.
 *
 * Structured data is emitted as `BreadcrumbList` JSON-LD rather than as the
 * microdata this component used to carry: the rest of the site (LocalBusiness,
 * ItemList, FAQPage) is JSON-LD, and mixing the two formats on one page is how
 * you end up with two different breadcrumb trails in the same document. The
 * JSON-LD is built from exactly the `items` that are rendered, on absolute
 * canonical URLs, so the two can never drift apart.
 */
export function Breadcrumbs({ items, visible }: BreadcrumbsProps) {
  const trail = [{ label: 'Home', href: '/' }, ...items];

  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      item: absoluteUrl(crumb.href),
    })),
  };

  const shown = visible === undefined ? items : items.slice(0, visible);
  const truncated = shown.length < items.length;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }}
      />
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            <Link
              href="/"
              className="flex items-center transition-colors hover:text-green-600 dark:hover:text-green-500"
            >
              <Home className="h-4 w-4" />
              <span className="sr-only">Home</span>
            </Link>
          </li>

          {shown.map((item, index) => (
            <li key={item.href} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 text-zinc-400" />
              {index === shown.length - 1 && !truncated ? (
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{item.label}</span>
              ) : (
                <Link
                  href={item.href}
                  className="transition-colors hover:text-green-600 dark:hover:text-green-500"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
