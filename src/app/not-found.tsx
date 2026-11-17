import { SiteChrome } from "@/components/SiteChrome";
import { NotFoundContent } from "@/components/NotFoundContent";

// Unmatched URLs. The root layout has no visible frame, so this page brings
// the public header and footer itself. `notFound()` from a public page is
// caught by `src/app/(site)/not-found.tsx` instead, inside the group layout.
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
