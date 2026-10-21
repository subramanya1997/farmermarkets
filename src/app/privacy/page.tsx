import type { Metadata } from "next";
import { SITE_FRAME } from "@/lib/ui";

export const metadata: Metadata = {
  alternates: {
    canonical: '/privacy',
  },
  openGraph: {
    url: '/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-gradient-to-b from-green-50 to-white dark:from-green-900/20 dark:to-zinc-950">
        <div className={SITE_FRAME}>
          <div className="flex flex-col items-center space-y-4 sm:space-y-6 text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tighter">
              Privacy Policy
            </h1>
            <p className="mx-auto max-w-[700px] text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400">
              Learn how we protect your privacy and handle your data
            </p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="w-full py-8 sm:py-12 md:py-16 bg-white dark:bg-zinc-900">
        <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
          <div className="prose prose-zinc dark:prose-invert max-w-none">
            <div className="space-y-8 sm:space-y-12">
              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Information We Collect</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We collect limited information about how the directory is used, including:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>An approximate country and state or region from an IP-based location lookup, used to sort nearby markets</li>
                  <li>Search terms, selected countries, filters, and structured survey answers used to improve market coverage</li>
                  <li>Optional name, organization, email address, phone number, and message when you ask us to contact you</li>
                  <li>Your email address and, if you give it, your ZIP code when you sign up for the newsletter</li>
                  <li>Page views, device information, and aggregate usage statistics collected through Google Analytics, Vercel Web Analytics, and PostHog</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">How We Use Your Information</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We use the information we collect to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Provide and improve our services</li>
                  <li>Understand which countries, market types, and directory features people need</li>
                  <li>Identify unsuccessful searches and gaps in official market coverage</li>
                  <li>Analyze usage patterns and optimize performance</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Newsletter</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  When you sign up for the newsletter we store your email address, the ZIP code if you give one, the page you signed up from, and the time you signed up and confirmed. We send one confirmation email first, and you are not on the list until you click the link in it. After that we email you no more than once a week about farmers markets near you and what is in season.
                </p>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Subscriber records are kept in our database, and emails are sent through Resend, which receives your email address for that purpose. We do not sell or share the list with anyone else, and we do not send your email address to Google Analytics, Vercel Analytics, or PostHog.
                </p>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Every email has an unsubscribe link, and unsubscribing takes effect immediately. We keep a record that the address unsubscribed so it does not get emailed again by mistake. To have the record deleted entirely, email{' '}
                  <a href="mailto:legal@farmermarkets.app" className="text-green-700 underline underline-offset-2 dark:text-green-400">legal@farmermarkets.app</a>.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Data Security</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We take the security of your data seriously and implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Cookies and Tracking</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We use Google Analytics, Vercel Web Analytics, PostHog, and limited browser storage to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Remember your preferences</li>
                  <li>Analyze site traffic and usage</li>
                  <li>Improve our services</li>
                  <li>Prioritize new official data sources and directory features</li>
                </ul>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Search terms are truncated before analytics collection, and values that look like email addresses or phone numbers are replaced with a redacted marker. The discovery form may optionally collect contact details and a message so we can respond about listings, corrections, operations, data coverage, or partnerships. Those contact fields and messages are delivered privately through Resend to our designated inbox, requests from the market operators form are also stored in our database so we can review them, and none of it is sent to Google Analytics, Vercel Analytics, or PostHog. Analytics receives only non-identifying details such as the selected answer, country filter, help-topic count, and whether a contact method was provided. Browser storage is used to avoid showing the same form repeatedly.
                </p>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Google Analytics, Vercel Web Analytics, and PostHog load automatically on every visit. They collect page views and the interaction events listed above, and Google Analytics and PostHog may store analytics cookies. PostHog also records clicks on page elements, error reports when a page fails, and may record session replays that show how a visit unfolded. Anything typed into a form field is masked in those replays. The site does not display a separate analytics consent banner.
                </p>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  Approximate-location events may include a country or state/region, but the events we send do not include your device&apos;s latitude or longitude. PostHog estimates an approximate, city-level location from the IP address of each visit.
                </p>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Your Rights</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  You have the right to:
                </p>
                <ul className="list-disc pl-5 space-y-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  <li>Access your personal data</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Opt-out of marketing communications</li>
                </ul>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <h2 className="text-xl sm:text-2xl font-bold">Updates to This Policy</h2>
                <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                  We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date below.
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Last Updated: October 21, 2026
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
