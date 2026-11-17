import type { Metadata } from 'next';
import Link from 'next/link';
import { MAX_PHOTOS_PER_MARKET, MAX_PHOTO_BYTES, requireAdmin } from '@/lib/organizer';
import { DocList, DocPanel, PageHeader, TEXT_LINK } from '@/components/dashboard/DocBits';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin help',
  robots: { index: false, follow: false },
};

const PHOTO_MB = Math.round(MAX_PHOTO_BYTES / (1024 * 1024));

export default async function AdminHelpPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Help">How review, admin edits, resets, managers and photos work.</PageHeader>

      <DocPanel title="Review">
        <p>
          Everything organizers send waits in the{' '}
          <Link href="/admin/review" className={TEXT_LINK}>
            review queue
          </Link>
          , and each new claim or update emails every admin.
        </p>
        <DocList>
          <li>
            <strong>Claims.</strong> Approving one makes that person a manager of the market. They get an email either
            way, with your note if you add one.
          </li>
          <li>
            <strong>Listing updates.</strong> You see each changed section before and after. Approving publishes those
            sections and refreshes the market, city and state pages right away. The organizer gets an email either way.
          </li>
          <li>
            <strong>Photos.</strong> Approve or reject each one. Organizers are not emailed about photos.
          </li>
          <li>
            <strong>Older contact form claims.</strong> Requests sent before accounts existed. Reply by email, then mark
            each one handled.
          </li>
        </DocList>
      </DocPanel>

      <DocPanel title="Editing a market yourself">
        <p>
          Open any market from{' '}
          <Link href="/admin/markets" className={TEXT_LINK}>
            Markets
          </Link>
          . It is the organizers&apos; editor plus the name, street address, ZIP, location note, map pin and the option
          to hide the map.
        </p>
        <DocList>
          <li>Your edits publish immediately, with no review, and leave an approved entry in the market&apos;s history.</li>
          <li>City and state cannot be changed, because they decide which city page lists the market.</li>
          <li>
            Bulk views (the full market list, day and topic pages, near me, the sitemap and llms.txt) read the dataset
            directly and pick up edits at the next deploy.
          </li>
        </DocList>
      </DocPanel>

      <DocPanel title="Resetting to the original data">
        <p>
          &ldquo;Reset to original data&rdquo; removes one published section, so the listing falls back to what the source
          dataset says. Use it to undo an edit that should not have gone live.
        </p>
      </DocPanel>

      <DocPanel title="Managers">
        <DocList>
          <li>A market can have several managers. Each sends their own updates, and each one is reviewed.</li>
          <li>
            Add a manager by email on the market&apos;s admin page. They need an organizer account with a confirmed email
            first. Revoking removes their access straight away.
          </li>
          <li>
            A listing says it is kept up to date by the market organizer only while the market has a verified manager;
            otherwise the footer credits Farmer Markets.
          </li>
          <li>
            <Link href="/admin/organizers" className={TEXT_LINK}>
              Organizers
            </Link>{' '}
            lists every account with the markets it manages and its claims.
          </li>
        </DocList>
      </DocPanel>

      <DocPanel title="Photos">
        <DocList>
          <li>
            Organizers upload straight to Vercel Blob: up to {MAX_PHOTOS_PER_MARKET} per market, JPEG, PNG or WebP, up to{' '}
            {PHOTO_MB} MB each.
          </li>
          <li>New photos stay pending until you approve them. Rejected or removed photos are deleted from Blob.</li>
        </DocList>
      </DocPanel>

      <DocPanel title="Access and email">
        <p>
          Who is an admin, where alerts go and which sender is used are all environment variables. See{' '}
          <Link href="/admin/settings" className={TEXT_LINK}>
            Settings
          </Link>
          .
        </p>
      </DocPanel>
    </div>
  );
}
