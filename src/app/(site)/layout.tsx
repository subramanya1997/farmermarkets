import type { ReactNode } from "react";
import { SiteChrome } from "@/components/SiteChrome";

/**
 * Every public page: the directory, market and city pages, the blog and the
 * info pages. The route group adds no URL segment.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
