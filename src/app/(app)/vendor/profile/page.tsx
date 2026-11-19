import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { MAX_VENDOR_PHOTOS, MAX_VENDOR_PHOTO_BYTES, VENDOR_PHOTO_CONTENT_TYPES } from '@/lib/vendorProfile';
import type { VendorOverview } from '@/lib/vendors';
import { PageHeader } from '@/components/dashboard/DocBits';
import { Callout, LINK, NoteFrom } from '@/components/vendor/bits';
import { ProfileEditor } from '@/components/vendor/ProfileEditor';
import { cachedVendorOverview } from '../_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your vendor profile',
  robots: { index: false, follow: false },
};

export default async function VendorProfilePage() {
  const user = await requireOrganizer('/vendor/profile');
  const overview = await cachedVendorOverview(user);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Profile">Your public page. Markets you are listed at link to it.</PageHeader>
      <ProfileState overview={overview} />
      <ProfileEditor
        initial={overview.draft}
        hasLive={overview.live !== null}
        canSendUnchanged={overview.state === 'draft'}
        limits={{ maxPhotos: MAX_VENDOR_PHOTOS, maxPhotoBytes: MAX_VENDOR_PHOTO_BYTES, photoTypes: VENDOR_PHOTO_CONTENT_TYPES }}
      />
    </div>
  );
}

function PublicLink({ href }: { href: string }) {
  return (
    <Link href={href} target="_blank" rel="noopener" className={`${LINK} inline-flex items-center gap-1`}>
      View your page
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
      <span className="sr-only">(opens in a new tab)</span>
    </Link>
  );
}

function ProfileState({ overview }: { overview: VendorOverview }) {
  const { state, live, publicPath, reviewNote, suspended } = overview;
  if (suspended) {
    return (
      <Callout tone="problem" title="Your public page is taken down">
        You can still edit and send changes. If you think this is a mistake, reply to the email we sent you.
      </Callout>
    );
  }
  switch (state) {
    case 'none':
      return (
        <Callout title="Tell shoppers who you are">
          Fill in what you can and send it. We check every new profile before it goes live, usually within two business days.
        </Callout>
      );
    case 'draft':
      return (
        <Callout title="Not sent yet">
          Check the details below, then send it for review. Nothing is public until we approve it.
        </Callout>
      );
    case 'pending':
      return live ? (
        <Callout tone="waiting" title="Your changes are waiting for review">
          Your live page stays up as it is until we approve them. {publicPath ? <PublicLink href={publicPath} /> : null}
        </Callout>
      ) : (
        <Callout tone="waiting" title="Waiting for review">
          We will email you once it is live. You can keep editing; sending again replaces what is waiting.
        </Callout>
      );
    case 'approved':
      return (
        <Callout tone="success" title="Your profile is live">
          Changes you send are checked before they replace what is live. {publicPath ? <PublicLink href={publicPath} /> : null}
        </Callout>
      );
    case 'rejected':
      return (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">{live ? 'Your last changes were not approved' : 'Your profile needs a fix before it can go live'}</p>
          {reviewNote ? <NoteFrom who="Note from our team">{reviewNote}</NoteFrom> : <p>Check the details below and send it again.</p>}
          {live ? <p>Your live page is unchanged. {publicPath ? <PublicLink href={publicPath} /> : null}</p> : null}
        </div>
      );
  }
}
