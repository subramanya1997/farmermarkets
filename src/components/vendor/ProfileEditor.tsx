'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Info } from 'lucide-react';
import { submitVendorProfileAction } from '@/app/(app)/vendor/actions';
import { PRODUCT_CODES, SOCIAL_PLATFORMS } from '@/lib/listingEdits';
import { parseVendorProfile, type VendorPhoto, type VendorProfile } from '@/lib/vendorProfile';
import { PRODUCT_LABELS, SOCIAL_LABELS } from '@/components/organizer/editor/labels';
import {
  AddButton,
  ChipGroup,
  Field,
  FieldErrorsContext,
  FieldGroup,
  RowCard,
  SectionCard,
  SelectInput,
  StringList,
  TextArea,
  TextInput,
  optionsFrom,
} from './fields';
import { StickyBar, focusFirstInvalid, toErrorMap, useLeaveGuard, type Notice } from './StickyBar';
import { VendorPhotos } from './VendorPhotos';

type Platform = (typeof SOCIAL_PLATFORMS)[number];
type Product = (typeof PRODUCT_CODES)[number];

/** The form as typed: every optional text is a string, rows may be blank. */
interface ProfileForm {
  name: string;
  products: Product[];
  items: string[];
  description: string;
  website: string;
  social_profiles: { platform: Platform; url: string }[];
  phone: string;
  email: string;
  photos: VendorPhoto[];
}

const MAX_ITEMS = 20;
const MAX_SOCIAL = 6;
const MAX_ABOUT = 1200;

function toForm(profile: VendorProfile): ProfileForm {
  return {
    name: profile.name ?? '',
    products: [...profile.products],
    items: [...profile.items],
    description: profile.description ?? '',
    website: profile.website ?? '',
    social_profiles: profile.social_profiles.map((row) => ({ platform: row.platform, url: row.url })),
    phone: profile.phone ?? '',
    email: profile.email ?? '',
    photos: profile.photos.map((photo) => ({ ...photo })),
  };
}

/** Blank rows dropped and text trimmed, so an empty row never blocks sending. */
function compact(form: ProfileForm): ProfileForm {
  return {
    ...form,
    name: form.name.trim(),
    items: form.items.map((item) => item.trim()).filter(Boolean),
    description: form.description.trim(),
    website: form.website.trim(),
    social_profiles: form.social_profiles.map((row) => ({ ...row, url: row.url.trim() })).filter((row) => row.url),
    phone: form.phone.trim(),
    email: form.email.trim(),
    photos: form.photos.map((photo) => ({ ...photo, alt: photo.alt?.trim() || undefined })),
  };
}

function fingerprint(form: ProfileForm): string {
  return JSON.stringify(compact(form));
}

const SOCIAL_OPTIONS = optionsFrom(SOCIAL_PLATFORMS, SOCIAL_LABELS);

export interface ProfileEditorProps {
  initial: VendorProfile;
  /** Something is already live, so a send is a change, not a first review. */
  hasLive: boolean;
  /** A draft nobody has sent yet may go as it is. */
  canSendUnchanged: boolean;
  limits: { maxPhotos: number; maxPhotoBytes: number; photoTypes: string[] };
}

export function ProfileEditor({ initial, hasLive, canSendUnchanged, limits }: ProfileEditorProps) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<ProfileForm>(() => toForm(initial));
  const [baseline, setBaseline] = useState(() => fingerprint(toForm(initial)));
  const [sentOnce, setSentOnce] = useState(false);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, startSending] = useTransition();

  const dirty = fingerprint(form) !== baseline;
  useLeaveGuard(dirty || uploading);

  // Errors from the last send fade out as they are fixed; new ones wait for the next send.
  const errors = useMemo(() => {
    const paths = Object.keys(submitted);
    if (paths.length === 0) return submitted;
    const check = parseVendorProfile(compact(form));
    // Photo errors come from the server only (an upload it does not recognise), so they stay until the photos change.
    const current: Record<string, string> = check.ok ? {} : toErrorMap(check.errors);
    return Object.fromEntries(paths.filter((path) => path in current || /^photos\.\d+$/.test(path)).map((path) => [path, current[path] ?? submitted[path]]));
  }, [submitted, form]);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function showErrors(list: { path: string; message: string }[], text: string) {
    setSubmitted(toErrorMap(list));
    setNotice({ tone: 'error', text });
    focusFirstInvalid(formRef.current);
  }

  function submit() {
    if (sending || uploading) return;
    const payload = compact(form);
    setForm(payload);
    const parsed = parseVendorProfile(payload);
    if (!parsed.ok) {
      showErrors(parsed.errors, 'A few fields need a fix before you send this.');
      return;
    }
    setSubmitted({});
    setNotice(null);
    startSending(async () => {
      try {
        const result = await submitVendorProfileAction(payload);
        if (result.ok) {
          setBaseline(fingerprint(payload));
          setSentOnce(true);
          setNotice({ tone: 'success', text: result.message ?? 'Sent for review.' });
          router.refresh();
        } else if (result.fieldErrors?.length) {
          showErrors(result.fieldErrors, result.error);
        } else {
          setNotice({ tone: 'error', text: result.error });
        }
      } catch {
        setNotice({ tone: 'error', text: 'That did not go through. Check your connection and try again.' });
      }
    });
  }

  const aboutLeft = MAX_ABOUT - form.description.length;
  const canSend = dirty || (canSendUnchanged && !sentOnce);

  return (
    <FieldErrorsContext.Provider value={errors}>
      {/* Not a <form>: Enter in a field should never send the whole profile. */}
      <div ref={formRef} className="flex flex-col gap-4">
        <SectionCard title="Your business" description="What shoppers see first on your page and on every market you sell at.">
          <Field label="Business name" path="name" hint="As it is on your sign or your stall banner.">
            {(control) => (
              <TextInput
                {...control}
                value={form.name}
                maxLength={120}
                autoComplete="organization"
                placeholder="Green Gate Farm"
                onChange={(event) => update('name', event.target.value)}
              />
            )}
          </Field>

          <FieldGroup legend="What you sell" hint="Pick all that fit. Shoppers filter by these." path="products">
            <ChipGroup options={PRODUCT_CODES} labels={PRODUCT_LABELS} value={form.products} onChange={(next) => update('products', next)} />
          </FieldGroup>

          <FieldGroup legend="Specialties" hint="Specific things in your own words, like sourdough or heirloom tomatoes. Up to 20." path="items">
            <StringList
              values={form.items}
              onChange={(next) => update('items', next)}
              max={MAX_ITEMS}
              pathPrefix="items"
              addLabel="Add a specialty"
              itemLabel={(index) => `Specialty ${index + 1}`}
              inputProps={{ maxLength: 60, placeholder: 'Sourdough' }}
            />
          </FieldGroup>

          <Field
            label="About"
            optional
            path="description"
            hint={
              <span aria-live="polite">
                {aboutLeft >= 0 ? `${aboutLeft} characters left.` : `${-aboutLeft} characters over the limit.`} How you started, how you grow or make things.
              </span>
            }
          >
            {(control) => (
              <TextArea
                {...control}
                value={form.description}
                rows={6}
                maxLength={MAX_ABOUT}
                placeholder="We are a family farm in the hills outside town. We grow over 40 kinds of vegetables without sprays."
                onChange={(event) => update('description', event.target.value)}
              />
            )}
          </Field>
        </SectionCard>

        <SectionCard title="Photos" description="Up to 7 photos. Use the arrows to choose the cover.">
          <VendorPhotos
            photos={form.photos}
            onChange={(change) => {
              setForm((current) => ({ ...current, photos: change(current.photos) }));
              // A server complaint about photo N no longer points at the same photo.
              setSubmitted((current) => Object.fromEntries(Object.entries(current).filter(([path]) => !/^photos\.\d+$/.test(path))));
              setNotice(null);
            }}
            onUploadingChange={setUploading}
            maxPhotos={limits.maxPhotos}
            maxBytes={limits.maxPhotoBytes}
            contentTypes={limits.photoTypes}
          />
        </SectionCard>

        <SectionCard title="Links and contact" description="How shoppers and markets can find you elsewhere.">
          <Field label="Website" optional path="website">
            {(control) => (
              <TextInput
                {...control}
                type="url"
                inputMode="url"
                autoComplete="url"
                value={form.website}
                maxLength={500}
                placeholder="https://greengatefarm.com"
                onChange={(event) => update('website', event.target.value)}
              />
            )}
          </Field>

          <FieldGroup legend="Social profiles" hint={`Up to ${MAX_SOCIAL}.`} path="social_profiles">
            <div className="flex flex-col gap-3">
              {form.social_profiles.map((row, index) => (
                <RowCard
                  key={index}
                  title={SOCIAL_LABELS[row.platform]}
                  removeLabel={`Remove ${SOCIAL_LABELS[row.platform]} profile`}
                  onRemove={() => update('social_profiles', form.social_profiles.filter((_, i) => i !== index))}
                >
                  <Field label="Site" path={`social_profiles.${index}.platform`}>
                    {(control) => (
                      <SelectInput
                        {...control}
                        value={row.platform}
                        options={SOCIAL_OPTIONS}
                        onChange={(platform) =>
                          platform &&
                          update(
                            'social_profiles',
                            form.social_profiles.map((item, i) => (i === index ? { ...item, platform } : item)),
                          )
                        }
                      />
                    )}
                  </Field>
                  <Field label="Profile link" path={`social_profiles.${index}.url`}>
                    {(control) => (
                      <TextInput
                        {...control}
                        type="url"
                        inputMode="url"
                        value={row.url}
                        maxLength={500}
                        placeholder="https://instagram.com/greengatefarm"
                        onChange={(event) =>
                          update(
                            'social_profiles',
                            form.social_profiles.map((item, i) => (i === index ? { ...item, url: event.target.value } : item)),
                          )
                        }
                      />
                    )}
                  </Field>
                </RowCard>
              ))}
              <AddButton
                onClick={() => {
                  const used = new Set(form.social_profiles.map((row) => row.platform));
                  const platform = SOCIAL_PLATFORMS.find((code) => !used.has(code) && code !== 'other') ?? 'other';
                  update('social_profiles', [...form.social_profiles, { platform, url: '' }]);
                }}
                count={form.social_profiles.length}
                max={MAX_SOCIAL}
              >
                Add a social profile
              </AddButton>
            </div>
          </FieldGroup>

          <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-950 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-100">
            <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
            <p>
              The phone and email below are <span className="font-medium">shown on your public page</span>. Leave them blank if you would rather not.
              The email you sign in with is never shown.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Public phone" optional path="phone">
              {(control) => (
                <TextInput
                  {...control}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  maxLength={40}
                  placeholder="(555) 123 4567"
                  onChange={(event) => update('phone', event.target.value)}
                />
              )}
            </Field>
            <Field label="Public email" optional path="email">
              {(control) => (
                <TextInput
                  {...control}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.email}
                  maxLength={254}
                  placeholder="hello@greengatefarm.com"
                  onChange={(event) => update('email', event.target.value)}
                />
              )}
            </Field>
          </div>
        </SectionCard>

        <p className="flex items-start gap-2 px-1 text-sm text-zinc-600 dark:text-zinc-400">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-400" />
          {hasLive
            ? 'Your live page stays as it is until we approve the changes.'
            : 'We check every new profile, usually within two business days, and email you when it is live.'}
        </p>

        <StickyBar
          notice={notice}
          idle={uploading ? 'Waiting for photos to finish uploading.' : dirty ? 'You have changes that are not sent yet.' : canSend ? 'Ready to send when you are.' : 'No changes yet.'}
          label="Send for review"
          busyLabel="Sending"
          busy={sending}
          disabled={!canSend || uploading}
          onSubmit={submit}
        />
      </div>
    </FieldErrorsContext.Provider>
  );
}
