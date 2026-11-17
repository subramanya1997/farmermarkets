import Link from "next/link";
import type { Metadata } from "next";
import { NOTICE_BUTTON, NewsletterNotice } from "@/components/NewsletterNotice";
import { isWellFormedToken } from "@/lib/newsletter";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

interface UnsubscribePageProps {
  searchParams: Promise<{ token?: string; status?: string }>;
}

// Same shape as the confirm page: a button, so a mail scanner opening the
// link cannot unsubscribe anyone by itself.
export default async function NewsletterUnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token, status } = await searchParams;

  if (status === "done") {
    return (
      <NewsletterNotice title="You're unsubscribed">
        <p>You will not get any more newsletter emails from us. If that was a mistake, you can sign up again from any page.</p>
        <p><Link href="/" className={NOTICE_BUTTON}>Back to the site</Link></p>
      </NewsletterNotice>
    );
  }

  if (status === "unavailable") {
    return (
      <NewsletterNotice title="Please try again soon">
        <p>We could not unsubscribe you just now. Open the link in your email again in a few minutes.</p>
      </NewsletterNotice>
    );
  }

  if (!isWellFormedToken(token)) {
    return (
      <NewsletterNotice title="This link does not work">
        <p>Use the unsubscribe link at the bottom of any of our emails. It may have been copied only in part.</p>
      </NewsletterNotice>
    );
  }

  return (
    <NewsletterNotice title="Unsubscribe?">
      <p>You will stop getting the Farmer Markets newsletter.</p>
      <form action="/api/newsletter/unsubscribe" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={NOTICE_BUTTON}>Unsubscribe</button>
      </form>
    </NewsletterNotice>
  );
}
