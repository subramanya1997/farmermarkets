import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrganizer } from '@/lib/organizer';
import { DocPanel, PageHeader, TEXT_LINK } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About Farmer Markets',
  robots: { index: false, follow: false },
};

export default async function OrganizerAboutPage() {
  await requireOrganizer('/dashboard/about');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="About Farmer Markets">What the site is and where your listing came from.</PageHeader>

      <DocPanel title="What Farmer Markets is">
        <p>
          A free directory of farmers markets and other public local-food places, from market halls and food co-ops to
          community gardens. Shoppers use it to find a market near them, check when it is open and see which payment and
          food assistance programs it takes.
        </p>
        <p>
          It is independent and not affiliated with the USDA or any government publisher. Listings are free, and
          managing yours costs nothing.
        </p>
      </DocPanel>

      <DocPanel title="Where listing data comes from">
        <p>
          Most listings start from the USDA Local Food Portal and official government open-data portals. Markets report
          those details themselves, so a listing can be out of date, and every page shows its source&apos;s own date.
        </p>
        <p>
          The government sources are checked daily and the USDA listings a few times a year. When you update your
          listing here, your changes are layered over that source data and credited to the market organizer, so a later
          data refresh does not undo them.
        </p>
        <p>
          A fix made with the original publisher, such as your USDA Local Food Portal listing, also reaches other sites
          that use the same feed, so it is worth doing both.
        </p>
        <p>
          <Link href="/about-the-data" className={TEXT_LINK}>
            About the data
          </Link>{' '}
          lists every source, its licence and how current it is.
        </p>
      </DocPanel>

      <DocPanel title="Why manage your listing">
        <p>
          A listing kept up to date by its organizer says so on the market&apos;s page, and your hours, links and photos
          are what shoppers see first. Questions are answered on{' '}
          <Link href="/dashboard/help" className={TEXT_LINK}>
            Help
          </Link>
          .
        </p>
      </DocPanel>
    </div>
  );
}
