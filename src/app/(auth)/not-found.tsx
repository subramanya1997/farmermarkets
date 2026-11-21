import { NotFoundContent } from "@/components/NotFoundContent";

// `notFound()` from a sign-in or apply page, inside the auth column's layout.
// Without this file it would fall through to the bare root not-found UI.
export default function NotFound() {
  return <NotFoundContent />;
}
