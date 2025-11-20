import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol 
        className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400"
        itemScope 
        itemType="https://schema.org/BreadcrumbList"
      >
        {/* Home */}
        <li
          itemProp="itemListElement"
          itemScope
          itemType="https://schema.org/ListItem"
        >
          <Link 
            href="/"
            className="flex items-center hover:text-green-600 dark:hover:text-green-500 transition-colors"
            itemProp="item"
          >
            <Home className="w-4 h-4" />
            <meta itemProp="name" content="Home" />
          </Link>
          <meta itemProp="position" content="1" />
        </li>

        {/* Dynamic items */}
        {items.map((item, index) => (
          <li
            key={item.href}
            className="flex items-center gap-2"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            <ChevronRight className="w-4 h-4 text-zinc-400" />
            {index === items.length - 1 ? (
              <span 
                className="font-medium text-zinc-900 dark:text-zinc-100"
                itemProp="name"
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-green-600 dark:hover:text-green-500 transition-colors"
                itemProp="item"
              >
                <span itemProp="name">{item.label}</span>
              </Link>
            )}
            <meta itemProp="position" content={(index + 2).toString()} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

