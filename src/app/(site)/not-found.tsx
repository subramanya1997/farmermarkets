import { NotFoundContent } from "@/components/NotFoundContent";

// `notFound()` from any public page. It renders inside the (site) layout, so
// the header and footer are already there; the root 404 adds its own.
export default function NotFound() {
  return <NotFoundContent />;
}
