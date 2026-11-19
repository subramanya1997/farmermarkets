'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { upload } from '@vercel/blob/client';
import { AlertCircle, ArrowDown, ArrowUp, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VendorPhoto } from '@/lib/vendorProfile';
import { PHOTO_FORMATS_LABEL, PHOTO_TYPE_ERROR, isHeicType, photoAccept, photoContentType, photoFileName } from '@/lib/photoTypes';
import { cn } from '@/lib/utils';
import { Field, FieldError, TextInput, useFieldError } from './fields';

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  state: 'uploading' | 'converting' | 'error';
  error?: string;
};

async function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    }
  } catch {
    // Fall through to the <img> path; some browsers cannot decode WebP here.
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || undefined, height: img.naturalHeight || undefined });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * Profile photos. Uploads go straight to the public Blob store; the photos
 * only become part of the profile when the vendor sends it for review.
 */
export function VendorPhotos({
  photos,
  onChange,
  onUploadingChange,
  maxPhotos,
  maxBytes,
  contentTypes,
}: {
  photos: VendorPhoto[];
  onChange: (update: (current: VendorPhoto[]) => VendorPhoto[]) => void;
  onUploadingChange: (uploading: boolean) => void;
  maxPhotos: number;
  maxBytes: number;
  contentTypes: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const prefix = useRef<string | null>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const inFlight = uploads.filter((item) => item.state !== 'error').length;
  const slotsLeft = Math.max(0, maxPhotos - photos.length - inFlight);
  const listError = useFieldError('photos');

  const patch = (key: string, next: Partial<UploadItem>) => setUploads((items) => items.map((item) => (item.key === key ? { ...item, ...next } : item)));

  async function pathPrefix(): Promise<string> {
    if (prefix.current) return prefix.current;
    const response = await fetch('/api/vendor/photos', { cache: 'no-store' });
    const body = (await response.json().catch(() => ({}))) as { pathPrefix?: string; error?: string };
    if (!response.ok || !body.pathPrefix) throw new Error(body.error || 'Uploads are not working right now. Try again in a moment.');
    prefix.current = body.pathPrefix;
    return body.pathPrefix;
  }

  async function uploadOne(file: File, contentType: string, key: string) {
    try {
      const heic = isHeicType(contentType);
      // Most browsers cannot decode HEIC; the server measures it after converting.
      const [folder, size] = await Promise.all([pathPrefix(), heic ? ({} as { width?: number; height?: number }) : imageSize(file)]);
      const blob = await upload(`${folder}${photoFileName(file.name, contentType)}`, file, {
        access: 'public',
        handleUploadUrl: '/api/vendor/photos',
        contentType,
        onUploadProgress: ({ percentage }) => patch(key, { progress: Math.round(percentage) }),
      });
      let photo: VendorPhoto = { url: blob.url, pathname: blob.pathname, width: size.width, height: size.height, alt: undefined };
      if (heic) {
        patch(key, { state: 'converting', progress: 100 });
        photo = { ...(await convertHeic(blob.url, blob.pathname)), alt: undefined };
      }
      onChange((current) => (current.length >= maxPhotos ? current : [...current, photo]));
      setUploads((items) => items.filter((item) => item.key !== key));
    } catch (cause) {
      patch(key, { state: 'error', error: cause instanceof Error && cause.message ? cause.message : 'Upload failed. Please try again.' });
    }
  }

  async function convertHeic(url: string, pathname: string): Promise<Omit<VendorPhoto, 'alt'>> {
    const response = await fetch('/api/vendor/photos/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, pathname }),
    });
    const body = (await response.json().catch(() => ({}))) as Partial<Omit<VendorPhoto, 'alt'>> & { error?: string };
    if (!response.ok || !body.url || !body.pathname) throw new Error(body.error || 'The photo did not save. Please try again.');
    return { url: body.url, pathname: body.pathname, width: body.width, height: body.height };
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const items: UploadItem[] = [];
    const accepted: { file: File; contentType: string; key: string }[] = [];
    let room = slotsLeft;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 9)}`;
      const contentType = photoContentType(file, contentTypes);
      let problem: string | undefined;
      if (!contentType) problem = PHOTO_TYPE_ERROR;
      else if (file.size > maxBytes) problem = `This photo is over ${megabytes(maxBytes)}. Try a smaller one.`;
      else if (room <= 0) problem = `A profile can have up to ${maxPhotos} photos.`;
      if (problem) {
        items.push({ key, name: file.name, progress: 0, state: 'error', error: problem });
      } else {
        room -= 1;
        items.push({ key, name: file.name, progress: 0, state: 'uploading' });
        accepted.push({ file, contentType: contentType!, key });
      }
    }
    setUploads((current) => [...current, ...items]);
    if (inputRef.current) inputRef.current.value = '';
    if (accepted.length === 0) return;
    onUploadingChange(true);
    try {
      await Promise.all(accepted.map(({ file, contentType, key }) => uploadOne(file, contentType, key)));
    } finally {
      onUploadingChange(false);
    }
  }

  function move(index: number, delta: -1 | 1) {
    onChange((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700">
        <div className="text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {photos.length} of {maxPhotos} photos
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{PHOTO_FORMATS_LABEL}, up to {megabytes(maxBytes)} each. The first one is your cover.</p>
        </div>
        {/* The browser's file picker has no shadcn equivalent: it stays hidden and the shadcn Button below opens it. */}
        <input
          ref={inputRef}
          type="file"
          accept={photoAccept(contentTypes)}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => void onFiles(event.target.files)}
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={slotsLeft <= 0}
          className="h-12 w-full bg-green-700 px-5 text-base text-white hover:bg-green-800 sm:h-11 sm:w-auto sm:text-sm dark:bg-green-700 dark:hover:bg-green-600"
        >
          <ImagePlus aria-hidden="true" />
          {slotsLeft <= 0 ? 'Photo limit reached' : 'Add photos'}
        </Button>
      </div>

      <FieldError message={listError} />

      {uploads.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {uploads.map((item) => (
            <UploadRow key={item.key} item={item} onDismiss={() => setUploads((all) => all.filter((other) => other.key !== item.key))} />
          ))}
        </ul>
      ) : null}

      {photos.length === 0 && uploads.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos yet. Your stall on a busy day, or what you sell up close, works well.</p>
      ) : null}

      {photos.length > 0 ? (
        <ol className="grid gap-4 sm:grid-cols-2">
          {photos.map((photo, index) => (
            <PhotoCard
              key={photo.url}
              photo={photo}
              index={index}
              count={photos.length}
              onAlt={(alt) => onChange((current) => current.map((item, i) => (i === index ? { ...item, alt } : item)))}
              onMove={(delta) => move(index, delta)}
              onRemove={() => onChange((current) => current.filter((_, i) => i !== index))}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function UploadRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const failed = item.state === 'error';
  return (
    <li
      className={cn(
        'rounded-lg border p-3 text-sm',
        failed ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30' : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40',
      )}
    >
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-red-700 dark:text-red-400" />
        ) : (
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin text-green-700" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
        {failed ? (
          <Button type="button" variant="ghost" className="h-11 px-3" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : (
          <span className="text-xs text-zinc-500 tabular-nums">{item.state === 'converting' ? 'Converting' : `${item.progress}%`}</span>
        )}
      </div>
      {failed ? (
        <p role="alert" className="mt-1 pl-6 text-red-800 dark:text-red-300">
          {item.error}
        </p>
      ) : (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
          <div className="h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${item.progress}%` }} />
        </div>
      )}
    </li>
  );
}

function PhotoCard({
  photo,
  index,
  count,
  onAlt,
  onMove,
  onRemove,
}: {
  photo: VendorPhoto;
  index: number;
  count: number;
  onAlt: (alt: string) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const cardError = useFieldError(`photos.${index}`);
  const name = photo.alt || `photo ${index + 1}`;
  return (
    <li
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-white dark:bg-zinc-950',
        cardError ? 'border-red-300 dark:border-red-800' : 'border-zinc-200 dark:border-zinc-800',
      )}
    >
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
        <Image src={photo.url} alt={photo.alt ?? ''} fill sizes="(min-width: 640px) 360px, 100vw" className="object-cover" />
        {index === 0 ? (
          <span className="absolute top-2 left-2 rounded-full bg-zinc-900/75 px-2 py-0.5 text-xs font-medium text-white">Cover photo</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 p-3">
        <FieldError message={cardError} />
        <Field label="Describe the photo" hint="For people using screen readers." path={`photos.${index}.alt`}>
          {(control) => (
            <TextInput
              {...control}
              value={photo.alt ?? ''}
              maxLength={200}
              placeholder="Loaves of sourdough on our table"
              onChange={(event) => onAlt(event.target.value)}
            />
          )}
        </Field>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className="size-11"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={index === 1 ? `Make ${name} the cover` : `Move ${name} earlier`}
            title="Move earlier"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="size-11"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${name} later`}
            title="Move later"
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto h-11 text-zinc-600 hover:bg-red-50 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            onClick={onRemove}
            aria-label={`Remove ${name}`}
          >
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
