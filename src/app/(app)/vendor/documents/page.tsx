import type { Metadata } from 'next';
import { Lock } from 'lucide-react';
import { requireOrganizer } from '@/lib/organizer';
import { DOCUMENT_CONTENT_TYPES, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS_PER_VENDOR } from '@/lib/vendorProfile';
import { PageHeader } from '@/components/dashboard/DocBits';
import { Callout, type LockerDocument } from '@/components/vendor/bits';
import { DocumentList } from '@/components/vendor/DocumentLocker';
import { DocumentUpload } from '@/components/vendor/DocumentUpload';
import { SectionCard } from '@/components/vendor/fields';
import { cachedVendorOverview } from '../_lib/overview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your documents',
  robots: { index: false, follow: false },
};

export default async function VendorDocumentsPage() {
  const user = await requireOrganizer('/vendor/documents');
  const overview = await cachedVendorOverview(user);
  const documents: LockerDocument[] = overview.documents.map((document) => ({
    id: document.id,
    label: document.label,
    contentType: document.contentType,
    size: document.size,
    expiresOn: document.expiresOn,
    expired: document.expired,
    usedBy: document.usedBy,
  }));
  const full = documents.length >= MAX_DOCUMENTS_PER_VENDOR;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Documents">Permits, insurance and certificates. Upload once, attach to any market.</PageHeader>

      <p className="flex items-start gap-2 px-1 text-sm text-zinc-600 dark:text-zinc-400">
        <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" />
        Private. Only you, our team and the markets you send a document to can open it.
      </p>

      {!overview.documentsEnabled ? (
        <Callout title="Document uploads are not available yet">
          You can still set up your profile and apply to markets. We will let you know when you can add documents here.
        </Callout>
      ) : full ? (
        <Callout tone="waiting" title={`You have ${MAX_DOCUMENTS_PER_VENDOR} documents, the most you can keep`}>
          Delete one you no longer need to add another.
        </Callout>
      ) : (
        <SectionCard title="Add a document">
          <DocumentUpload maxBytes={MAX_DOCUMENT_BYTES} contentTypes={DOCUMENT_CONTENT_TYPES} />
        </SectionCard>
      )}

      <section aria-labelledby="locker" className="space-y-3 pt-2">
        <h2 id="locker" className="text-lg font-semibold tracking-tight">
          Your documents
        </h2>
        <DocumentList documents={documents} />
      </section>
    </div>
  );
}
