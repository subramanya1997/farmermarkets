import type { Metadata } from 'next';
import Link from 'next/link';
import { requireOrganizer, MAX_PHOTOS_PER_MARKET, MAX_PHOTO_BYTES } from '@/lib/organizer';
import { DocList, DocPanel, PageHeader, TEXT_LINK } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Help',
  robots: { index: false, follow: false },
};

const PHOTO_MB = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));

export default async function OrganizerHelpPage() {
  await requireOrganizer('/dashboard/help');

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <PageHeader title="Help">How claiming, review and publishing work, and how to reach us.</PageHeader>

      <DocPanel title="Claiming your market" id="claiming">
        <p>
          Find your market on{' '}
          <Link href="/dashboard/claim" className={TEXT_LINK}>
            Claim a market
          </Link>{' '}
          and tell us how you are connected to it. A person checks every claim, usually within two business days, and
          we email you either way. Once it is approved the market shows up in your sidebar and you can update it.
        </p>
        <p>
          More than one person can manage the same market. Each person on your team signs up with their own email and
          claims it, and each claim is checked the same way.
        </p>
      </DocPanel>

      <DocPanel title="Review and publishing" id="review">
        <DocList>
          <li>Edit any section of your listing, then send it for review. Only the sections you changed are sent.</li>
          <li>
            Nothing goes live on its own. We read every update, usually within two business days, and email you when it is
            published, or with a note when we could not publish it.
          </li>
          <li>
            While an update is waiting, your market shows a dot in the sidebar. Sending again replaces the waiting update,
            so it always holds your latest version.
          </li>
          <li>
            Once published, your market&apos;s page and its city and state pages change right away. Lists that cover
            many markets, like the full market list and the day of the week pages, catch up the next time the site is rebuilt.
          </li>
        </DocList>
      </DocPanel>

      <DocPanel title="What you can change" id="changes">
        <p>Hours, season, status, the description, links and contact details, payments and food assistance, what you sell, amenities, vendors, events and programs.</p>
        <p>
          You can also suggest a new market name, street address or map pin. Those always wait for review like
          everything else.
        </p>
        <p>
          City and state are locked, because they decide which city page lists your market. If yours is wrong, tell us
          and we will move it.
        </p>
      </DocPanel>

      <DocPanel title="Photos" id="photos">
        <DocList>
          <li>
            Up to {MAX_PHOTOS_PER_MARKET} photos per market, JPEG, PNG or WebP, up to {PHOTO_MB} MB each. Landscape
            photos look best.
          </li>
          <li>Only upload photos you took or have permission to use.</li>
          <li>
            New photos wait for review and show as waiting on your market&apos;s page. Approved photos go live; ones we
            cannot use are removed and deleted.
          </li>
          <li>You can reorder, caption or remove your photos at any time.</li>
        </DocList>
      </DocPanel>

      <DocPanel title="The &ldquo;Find us on Farmer Markets&rdquo; badge" id="badge">
        <p>
          Each market page here has a small badge you can copy onto your own website. It links visitors to your listing,
          so they can check hours and directions before they come. It is one short line of HTML, a link around a small
          image with our leaf logo, with no scripts. It pastes into Squarespace, Wix or WordPress without breaking
          anything.
        </p>
      </DocPanel>

      <DocPanel title="Get in touch" id="contact">
        <p>
          For anything this page does not cover, use the{' '}
          <Link href="/for-market-operators" className={TEXT_LINK}>
            form for market operators
          </Link>
          . Mention the market and the email you sign in with, and we will reply by email.
        </p>
      </DocPanel>
    </div>
  );
}
