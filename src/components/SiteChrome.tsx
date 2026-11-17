import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { VisitorPrompts } from "@/components/VisitorPrompts";
import { DiscoverySurvey } from "@/components/DiscoverySurvey";
import { Footer } from "@/components/Footer";

/**
 * The public site's frame: header, footer and the visitor prompts. It wraps
 * every page in `src/app/(site)` through that group's layout, and the root
 * 404 page, which renders outside any group. The signed-in areas
 * (`src/app/(app)`) and the auth pages (`src/app/(auth)`) have their own
 * frames and never show this one.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 w-full">
        {children}
      </main>
      <Footer />
      {/* Contextual questions (src/components/VisitorPrompts.tsx) and the
          on-demand feedback form behind the footer's "Send feedback". */}
      <VisitorPrompts />
      <DiscoverySurvey />
    </div>
  );
}
