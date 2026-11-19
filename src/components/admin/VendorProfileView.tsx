/** Shows a vendor profile for review: all text is plain text, links open in a new tab. Server-safe. */
import type { ReactNode } from 'react';
import { PRODUCT_LABELS } from '@/components/organizer/editor/labels';
import { VENDOR_FIELD_LABELS, VENDOR_PROFILE_FIELDS, type VendorProfile } from '@/lib/vendorProfile';
import { ExternalA, Muted } from './bits';
import { SOCIAL_LABELS, safeHttpUrl, shortUrl } from './format';

type Field = keyof VendorProfile;

function LinkLine({ href, label }: { href: string; label?: string }) {
  const safe = safeHttpUrl(href);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      {label ? <span className="text-zinc-500 dark:text-zinc-400">{label}</span> : null}
      <span className="break-all">{shortUrl(href)}</span>
      {safe ? <ExternalA href={safe}>Open</ExternalA> : <Muted>Not a web link</Muted>}
    </span>
  );
}

function Photos({ photos, knownUrls }: { photos: VendorProfile['photos']; knownUrls?: ReadonlySet<string> }) {
  if (photos.length === 0) return <Muted>None</Muted>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo, index) => {
        const isNew = knownUrls ? !knownUrls.has(photo.url) : false;
        return (
          <li key={photo.url} className="min-w-0 space-y-1">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin review thumbnail of a stored blob */}
              <img
                src={photo.url}
                alt={photo.alt || 'Vendor photo'}
                loading="lazy"
                width={160}
                height={120}
                className="h-28 w-full rounded-md border bg-zinc-100 object-cover dark:bg-zinc-800"
              />
              {isNew ? (
                <span className="absolute top-1 left-1 rounded bg-green-700 px-1.5 py-0.5 text-[11px] font-medium text-white">New</span>
              ) : null}
              {index === 0 ? (
                <span className="absolute top-1 right-1 rounded bg-zinc-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">Cover</span>
              ) : null}
            </div>
            <p className="text-xs break-words text-zinc-600 dark:text-zinc-400">{photo.alt || 'No alt text'}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function FieldValue({ field, profile, knownPhotoUrls }: { field: Field; profile: VendorProfile | null; knownPhotoUrls?: ReadonlySet<string> }): ReactNode {
  if (!profile) return <Muted>Not set</Muted>;
  switch (field) {
    case 'name':
      return profile.name ? <span className="break-words">{profile.name}</span> : <Muted>None</Muted>;
    case 'description':
      return profile.description ? <p className="break-words whitespace-pre-line">{profile.description}</p> : <Muted>None</Muted>;
    case 'phone':
      return profile.phone ? <span>{profile.phone}</span> : <Muted>None</Muted>;
    case 'email':
      return profile.email ? <span className="break-all">{profile.email}</span> : <Muted>None</Muted>;
    case 'products':
      return profile.products.length ? <span>{profile.products.map((code) => PRODUCT_LABELS[code] ?? code).join(', ')}</span> : <Muted>None</Muted>;
    case 'items':
      return profile.items.length ? <span className="break-words">{profile.items.join(', ')}</span> : <Muted>None</Muted>;
    case 'website':
      return profile.website ? <LinkLine href={profile.website} /> : <Muted>None</Muted>;
    case 'social_profiles':
      return profile.social_profiles.length ? (
        <ul className="space-y-1">
          {profile.social_profiles.map((social) => (
            <li key={`${social.platform}-${social.url}`}>
              <LinkLine href={social.url} label={SOCIAL_LABELS[social.platform] ?? social.platform} />
            </li>
          ))}
        </ul>
      ) : (
        <Muted>None</Muted>
      );
    case 'photos':
      return <Photos photos={profile.photos} knownUrls={knownPhotoUrls} />;
  }
}

/** Every field of one profile, read only. */
export function ProfileReadOnly({ profile }: { profile: VendorProfile }) {
  return (
    <dl className="divide-y text-sm">
      {VENDOR_PROFILE_FIELDS.map((field) => (
        <div key={field} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
          <dt className="text-zinc-500 dark:text-zinc-400">{VENDOR_FIELD_LABELS[field]}</dt>
          <dd className="min-w-0">
            <FieldValue field={field} profile={profile} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Before and after for each changed field. A first-time profile shows every field as new. */
export function ProfileDiff({ live, proposed, changed }: { live: VendorProfile | null; proposed: VendorProfile; changed: readonly Field[] }) {
  const firstTime = live === null;
  const fields = firstTime ? VENDOR_PROFILE_FIELDS : VENDOR_PROFILE_FIELDS.filter((field) => changed.includes(field));
  const unchanged = firstTime ? [] : VENDOR_PROFILE_FIELDS.filter((field) => !changed.includes(field));
  const liveUrls = new Set(live?.photos.map((photo) => photo.url) ?? []);
  const proposedUrls = new Set(proposed.photos.map((photo) => photo.url));
  const removedPhotos = live?.photos.filter((photo) => !proposedUrls.has(photo.url)) ?? [];

  return (
    <div className="divide-y text-sm">
      <p className="px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
        {firstTime ? 'First submission. Everything below is new.' : `${fields.length} ${fields.length === 1 ? 'field' : 'fields'} changed.`}
      </p>
      {fields.length === 0 ? <p className="px-4 py-3 text-zinc-500 dark:text-zinc-400">No visible changes.</p> : null}
      {fields.map((field) => (
        <div key={field} className="space-y-2 px-4 py-3">
          <h3 className="font-medium">{VENDOR_FIELD_LABELS[field]}</h3>
          {firstTime ? (
            <div className="rounded-md border border-green-200 bg-green-50/60 p-3 dark:border-green-800/50 dark:bg-green-950/30">
              <FieldValue field={field} profile={proposed} knownPhotoUrls={field === 'photos' ? new Set() : undefined} />
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              <div className="min-w-0 rounded-md border border-red-200 bg-red-50/60 p-3 dark:border-red-800/50 dark:bg-red-950/30">
                <p className="mb-1.5 text-xs font-medium text-red-800 dark:text-red-300">Before</p>
                {field === 'photos' ? (
                  live && live.photos.length ? <Photos photos={live.photos} /> : <Muted>None</Muted>
                ) : (
                  <FieldValue field={field} profile={live} />
                )}
              </div>
              <div className="min-w-0 rounded-md border border-green-200 bg-green-50/60 p-3 dark:border-green-800/50 dark:bg-green-950/30">
                <p className="mb-1.5 text-xs font-medium text-green-800 dark:text-green-300">After</p>
                <FieldValue field={field} profile={proposed} knownPhotoUrls={field === 'photos' ? liveUrls : undefined} />
                {field === 'photos' && removedPhotos.length ? (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    Removed: {removedPhotos.length} {removedPhotos.length === 1 ? 'photo' : 'photos'}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ))}
      {unchanged.length ? (
        <p className="px-4 py-2.5 text-xs text-zinc-500 dark:text-zinc-400">
          Unchanged: {unchanged.map((field) => VENDOR_FIELD_LABELS[field]).join(', ')}
        </p>
      ) : null}
    </div>
  );
}
