import Link from "next/link";
import type { Metadata } from "next";
import { NOTICE_BUTTON, NewsletterNotice } from "@/components/NewsletterNotice";
import { isWellFormedToken } from "@/lib/newsletter";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  robots: { index: false, follow: false },
};

interface ConfirmPageProps {
  searchParams: Promise<{ token?: string; status?: string }>;
}

// Opening the emailed link lands here with `?token=`; the button posts it to
// /api/newsletter/confirm, which comes back with `?status=`.
export default async function NewsletterConfirmPage({ searchParams }: ConfirmPageProps) {
  const { token, status } = await searchParams;

  if (status === "confirmed") {
    return (
      <NewsletterNotice title="You're subscribed">
        <p>Thanks for confirming. A welcome email is on its way, and after that you will hear from us no more than once a week.</p>
        <p>
          <Link href="/" className={NOTICE_BUTTON}>Find a market near you</Link>
        </p>
      </NewsletterNotice>
    );
  }

  if (status === "expired") {
    return (
      <NewsletterNotice title="That link has expired">
        <p>Confirmation links work for 7 days. Sign up again from any page and we will send a fresh one.</p>
        <p><Link href="/blog" className={NOTICE_BUTTON}>Back to the site</Link></p>
      </NewsletterNotice>
    );
  }

  if (status === "unavailable") {
    return (
      <NewsletterNotice title="Please try again soon">
        <p>We could not confirm your subscription just now. Open the link in your email again in a few minutes.</p>
      </NewsletterNotice>
    );
  }

  if (status === "invalid" || !isWellFormedToken(token)) {
    return (
      <NewsletterNotice title="This link does not work">
        <p>It may have been used already, or copied only in part. If you are already subscribed, there is nothing more to do.</p>
        <p><Link href="/blog" className={NOTICE_BUTTON}>Back to the site</Link></p>
      </NewsletterNotice>
    );
  }

  return (
    <NewsletterNotice title="Confirm your subscription">
      <p>One tap and you will get markets near you and what is in season, no more than once a week.</p>
      <form action="/api/newsletter/confirm" method="post">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={NOTICE_BUTTON}>Confirm my subscription</button>
      </form>
    </NewsletterNotice>
  );
}
