'use client';

import { useId, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Clock, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { registerPhotoAction, removePhotoAction, reorderPhotosAction, updatePhotoAction } from '@/app/(app)/dashboard/actions';
import { cn } from '@/lib/utils';
import { SectionCard, TextInput } from './fields';

export interface EditorPhoto {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  status: 'pending' | 'approved';
}

interface PhotoManagerProps {
  slug: string;
  photos: EditorPhoto[];
  /** Blob folder every upload for this market must start with. */
  pathPrefix: string;
  maxPhotos: number;
  maxBytes: number;
  contentTypes: string[];
  /** Overrides the intro line, for example when uploads skip review. */
  description?: string;
}

type UploadItem = {
  key: string;
  name: string;
  progress: number;
  state: 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
};

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** A safe, readable Blob file name: "Market Day!.JPG" becomes "market-day.jpg". */
function blobFileName(file: File): string {
  const base = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'photo'}.${EXTENSIONS[file.type] ?? 'jpg'}`;
}

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
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
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

const DEFAULT_DESCRIPTION =
  'Real photos of your market help visitors picture the day. Each new photo is checked before it goes live.';

export function PhotoManager({
  slug,
  photos,
  pathPrefix,
  maxPhotos,
  maxBytes,
  contentTypes,
  description = DEFAULT_DESCRIPTION,
}: PhotoManagerProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [order, setOrder] = useState(photos);
  const [lastPhotos, setLastPhotos] = useState(photos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh server data replaces the local order (React's "adjust state on prop change").
  if (photos !== lastPhotos) {
    setLastPhotos(photos);
    setOrder(photos);
  }

  const inFlight = uploads.filter((item) => item.state === 'uploading' || item.state === 'saving').length;
  const slotsLeft = Math.max(0, maxPhotos - order.length - inFlight);

  const patchUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  async function uploadOne(file: File, key: string) {
    try {
      const { width, height } = await imageSize(file);
      const blob = await upload(`${pathPrefix}${blobFileName(file)}`, file, {
        access: 'public',
        handleUploadUrl: '/api/organizer/photos',
        clientPayload: JSON.stringify({ slug }),
        contentType: file.type,
        onUploadProgress: ({ percentage }) => patchUpload(key, { progress: Math.round(percentage) }),
      });
      patchUpload(key, { state: 'saving', progress: 100 });
      const result = await registerPhotoAction(slug, { url: blob.url, pathname: blob.pathname, width, height });
      if (!result.ok) throw new Error(result.error);
      patchUpload(key, { state: 'done' });
    } catch (cause) {
      const message = cause instanceof Error && cause.message ? cause.message : 'Upload failed. Please try again.';
      patchUpload(key, { state: 'error', error: message });
    }
  }

  async function onFiles(files: FileList | null) {
    setError(null);
    if (!files || files.length === 0) return;
    const picked = Array.from(files);
    const items: UploadItem[] = [];
    const accepted: { file: File; key: string }[] = [];
    let room = slotsLeft;

    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let problem: string | undefined;
      if (!contentTypes.includes(file.type)) problem = 'Use a JPEG, PNG or WebP photo.';
      else if (file.size > maxBytes) problem = `This photo is over ${megabytes(maxBytes)}. Try a smaller one.`;
      else if (room <= 0) problem = `A listing can have up to ${maxPhotos} photos.`;
      if (problem) {
        items.push({ key, name: file.name, progress: 0, state: 'error', error: problem });
      } else {
        room -= 1;
        items.push({ key, name: file.name, progress: 0, state: 'uploading' });
        accepted.push({ file, key });
      }
    }
    setUploads((current) => [...current.filter((item) => item.state !== 'done'), ...items]);
    if (inputRef.current) inputRef.current.value = '';

    await Promise.all(accepted.map(({ file, key }) => uploadOne(file, key)));
    if (accepted.length) router.refresh();
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= order.length || busy) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setBusy(true);
    setError(null);
    try {
      // One save for the whole order, so ties left by older uploads sort out too.
      const result = await reorderPhotosAction(slug, next.map((photo) => photo.id));
      if (!result.ok) throw new Error(result.error);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The new order did not save.');
      setOrder(order);
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function remove(photoId: string) {
    setBusy(true);
    setError(null);
    try {
      const result = await removePhotoAction(slug, photoId);
      if (!result.ok) throw new Error(result.error);
      setOrder((current) => current.filter((photo) => photo.id !== photoId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That photo could not be removed.');
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const visibleUploads = uploads.filter((item) => item.state !== 'done');

  return (
    <SectionCard title="Photos" description={description}>
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-700">
        <div className="text-sm">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {order.length} of {maxPhotos} photos
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            JPEG, PNG or WebP, up to {megabytes(maxBytes)} each. Landscape works best.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={contentTypes.join(',')}
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
          className="h-11 bg-green-700 px-5 text-white hover:bg-green-800 dark:bg-green-700 dark:hover:bg-green-600"
        >
          <ImagePlus aria-hidden="true" />
          {slotsLeft <= 0 ? 'Photo limit reached' : 'Add photos'}
        </Button>
      </div>

      {visibleUploads.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Uploads">
          {visibleUploads.map((item) => (
            <UploadRow key={item.key} item={item} onDismiss={() => setUploads((all) => all.filter((u) => u.key !== item.key))} />
          ))}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-400">
          <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {order.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">No photos yet. Start with a wide shot of a busy market day.</p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2">
          {order.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              slug={slug}
              photo={photo}
              index={index}
              count={order.length}
              busy={busy}
              onMove={(delta) => void move(index, delta)}
              onRemove={() => void remove(photo.id)}
              onSaved={() => router.refresh()}
            />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function UploadRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const failed = item.state === 'error';
  return (
    <li
      className={cn(
        'rounded-lg border p-3 text-sm',
        failed
          ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30'
          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40',
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
          <Button type="button" variant="ghost" className="h-9 px-3 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        ) : (
          <span className="text-xs text-zinc-500 tabular-nums">{item.state === 'saving' ? 'Saving' : `${item.progress}%`}</span>
        )}
      </div>
      {failed ? (
        <p className="mt-1 pl-6 text-red-800 dark:text-red-300">{item.error}</p>
      ) : (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
          <div className="h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${item.progress}%` }} />
        </div>
      )}
    </li>
  );
}

function PhotoCard({
  slug,
  photo,
  index,
  count,
  busy,
  onMove,
  onRemove,
  onSaved,
}: {
  slug: string;
  photo: EditorPhoto;
  index: number;
  count: number;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  onSaved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const label = photo.alt || `Photo ${index + 1}`;

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
        <Image
          src={photo.url}
          alt={photo.alt ?? ''}
          fill
          sizes="(min-width: 640px) 360px, 100vw"
          className="object-cover"
        />
        <span
          className={cn(
            'absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shadow-xs',
            photo.status === 'pending'
              ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-200'
              : 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950 dark:text-green-200',
          )}
        >
          {photo.status === 'pending' ? (
            <Clock aria-hidden="true" className="size-3.5" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="size-3.5" />
          )}
          {photo.status === 'pending' ? 'Waiting for review' : 'Live'}
        </span>
        {index === 0 ? (
          <span className="absolute top-2 right-2 rounded-full bg-zinc-900/75 px-2 py-0.5 text-xs font-medium text-white">
            Cover photo
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-3">
        <DetailInput
          slug={slug}
          photoId={photo.id}
          field="alt"
          label="Describe the photo"
          hint="For people using screen readers."
          placeholder="Shoppers at a tomato stand"
          initial={photo.alt ?? ''}
          onSaved={onSaved}
        />
        <DetailInput
          slug={slug}
          photoId={photo.id}
          field="caption"
          label="Caption"
          optional
          initial={photo.caption ?? ''}
          onSaved={onSaved}
        />

        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-red-50 p-2 text-sm dark:bg-red-950/30">
            <span className="flex-1 font-medium text-red-900 dark:text-red-200">Remove this photo for good?</span>
            <Button type="button" variant="ghost" className="h-10" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-10"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="size-11"
              disabled={busy || index === 0}
              onClick={() => onMove(-1)}
              aria-label={`Move ${label} earlier`}
              title="Move earlier"
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="size-11"
              disabled={busy || index === count - 1}
              onClick={() => onMove(1)}
              aria-label={`Move ${label} later`}
              title="Move later"
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="ml-auto h-11 text-zinc-600 hover:bg-red-50 hover:text-red-700 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

/** Saves on blur when the text changed. */
function DetailInput({
  slug,
  photoId,
  field,
  label,
  hint,
  optional,
  placeholder,
  initial,
  onSaved,
}: {
  slug: string;
  photoId: string;
  field: 'alt' | 'caption';
  label: string;
  hint?: string;
  optional?: boolean;
  placeholder?: string;
  initial: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    const next = value.trim();
    if (next === saved.trim()) return;
    setState('saving');
    try {
      const result = await updatePhotoAction(slug, photoId, { [field]: next });
      if (!result.ok) throw new Error(result.error);
      setSaved(next);
      setState('saved');
      onSaved();
    } catch {
      setState('error');
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
          {optional ? <span className="font-normal text-zinc-500 dark:text-zinc-400"> (optional)</span> : null}
        </label>
        <span aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          {state === 'saving' ? 'Saving' : state === 'saved' ? 'Saved' : null}
          {state === 'error' ? <span className="text-red-700 dark:text-red-400">Not saved. Try again.</span> : null}
        </span>
      </div>
      <TextInput
        id={id}
        value={value}
        maxLength={200}
        placeholder={placeholder}
        onChange={(event) => {
          setValue(event.target.value);
          if (state !== 'idle') setState('idle');
        }}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {hint ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}
