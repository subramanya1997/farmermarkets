'use client';

import { SOCIAL_PLATFORMS, type ListingEdits } from '@/lib/listingEdits';
import {
  AddButton,
  Field,
  FieldGroup,
  NativeSelect,
  RowCard,
  SectionCard,
  StringList,
  TextArea,
  TextInput,
} from '../fields';
import { SOCIAL_LABELS } from '../labels';

type About = NonNullable<ListingEdits['about']>;
type Contact = NonNullable<ListingEdits['contact']>;
type SocialProfile = Contact['social_profiles'][number];

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

function Counter({ value, max }: { value: string | undefined; max: number }) {
  const length = value?.length ?? 0;
  return (
    <span className={length > max * 0.9 ? 'text-amber-700 dark:text-amber-400' : undefined}>
      {length} of {max} characters
    </span>
  );
}

export function AboutSection({
  value,
  onChange,
}: {
  value: About | undefined;
  onChange: (next: About) => void;
}) {
  const about = value ?? {};
  return (
    <SectionCard id="section-about" title="About the market" description="Tell visitors what makes your market worth the trip.">
      <Field
        label="Description"
        path="about.description"
        hint={
          <>
            Visitors see this at the top of your page. A few sentences is plenty. <Counter value={about.description} max={1500} />
          </>
        }
      >
        {(control) => (
          <TextArea
            {...control}
            rows={6}
            maxLength={1500}
            value={about.description ?? ''}
            onChange={(event) => onChange({ ...about, description: event.target.value })}
          />
        )}
      </Field>
      <Field
        label="Good to know before you go"
        optional
        path="about.visitor_note"
        hint={
          <>
            Practical tips, like where to park or to bring a bag. <Counter value={about.visitor_note} max={400} />
          </>
        }
      >
        {(control) => (
          <TextArea
            {...control}
            rows={3}
            maxLength={400}
            value={about.visitor_note ?? ''}
            onChange={(event) => onChange({ ...about, visitor_note: event.target.value })}
          />
        )}
      </Field>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ *
 * Links and contact
 * ------------------------------------------------------------------ */

const EMPTY_CONTACT: Contact = { websites: [], phone_numbers: [], emails: [], social_profiles: [] };

const URL_INPUT = { type: 'url', inputMode: 'url', placeholder: 'https://', autoComplete: 'url', maxLength: 500 } as const;

export function ContactSection({
  value,
  onChange,
}: {
  value: Contact | undefined;
  onChange: (next: Contact) => void;
}) {
  const contact = value ?? EMPTY_CONTACT;
  const set = (patch: Partial<Contact>) => onChange({ ...contact, ...patch });
  const socials = contact.social_profiles;
  const updateSocial = (index: number, patch: Partial<SocialProfile>) =>
    set({ social_profiles: socials.map((row, i) => (i === index ? { ...row, ...patch } : row)) });

  return (
    <SectionCard id="section-contact" title="Links and contact" description="How visitors and vendors can reach you.">
      <FieldGroup legend="Website" hint="Your own site first. Up to 3.">
        <StringList
          values={contact.websites}
          onChange={(websites) => set({ websites })}
          max={3}
          pathPrefix="contact.websites"
          addLabel="Add a website"
          itemLabel={(index) => `Website ${index + 1}`}
          inputProps={URL_INPUT}
        />
      </FieldGroup>

      <FieldGroup legend="Phone" hint="Include the area code. Up to 3.">
        <StringList
          values={contact.phone_numbers}
          onChange={(phone_numbers) => set({ phone_numbers })}
          max={3}
          pathPrefix="contact.phone_numbers"
          addLabel="Add a phone number"
          itemLabel={(index) => `Phone ${index + 1}`}
          inputProps={{ type: 'tel', inputMode: 'tel', autoComplete: 'tel', maxLength: 40 }}
        />
      </FieldGroup>

      <FieldGroup legend="Email" hint="Shown publicly, so a shared market address works best. Up to 3.">
        <StringList
          values={contact.emails}
          onChange={(emails) => set({ emails })}
          max={3}
          pathPrefix="contact.emails"
          addLabel="Add an email"
          itemLabel={(index) => `Email ${index + 1}`}
          inputProps={{ type: 'email', inputMode: 'email', autoComplete: 'email', maxLength: 254 }}
        />
      </FieldGroup>

      <FieldGroup legend="Social media">
        <div className="flex flex-col gap-3">
          {socials.map((row, index) => (
            <RowCard
              key={index}
              title={SOCIAL_LABELS[row.platform]}
              onRemove={() => set({ social_profiles: socials.filter((_, i) => i !== index) })}
              removeLabel={`Remove ${SOCIAL_LABELS[row.platform]} link`}
            >
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Field label="Platform" path={`contact.social_profiles.${index}.platform`}>
                  {(control) => (
                    <NativeSelect
                      {...control}
                      value={row.platform}
                      onChange={(event) => updateSocial(index, { platform: event.target.value as SocialProfile['platform'] })}
                    >
                      {SOCIAL_PLATFORMS.map((code) => (
                        <option key={code} value={code}>
                          {SOCIAL_LABELS[code]}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
                <Field label="Profile link" path={`contact.social_profiles.${index}.url`}>
                  {(control) => (
                    <TextInput
                      {...control}
                      {...URL_INPUT}
                      value={row.url}
                      onChange={(event) => updateSocial(index, { url: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            </RowCard>
          ))}
          <AddButton
            count={socials.length}
            max={8}
            onClick={() => set({ social_profiles: [...socials, { platform: nextPlatform(socials), url: '' }] })}
          >
            Add a social profile
          </AddButton>
        </div>
      </FieldGroup>

      <Field label="Newsletter sign-up link" optional path="contact.newsletter_url">
        {(control) => (
          <TextInput
            {...control}
            {...URL_INPUT}
            value={contact.newsletter_url ?? ''}
            onChange={(event) => set({ newsletter_url: event.target.value })}
          />
        )}
      </Field>
      <Field
        label="Online ordering link"
        optional
        path="contact.online_ordering_url"
        hint="For preorders or pickup, if you offer them."
      >
        {(control) => (
          <TextInput
            {...control}
            {...URL_INPUT}
            value={contact.online_ordering_url ?? ''}
            onChange={(event) => set({ online_ordering_url: event.target.value })}
          />
        )}
      </Field>
    </SectionCard>
  );
}

/** Suggest the first common platform not used yet. */
function nextPlatform(existing: SocialProfile[]): SocialProfile['platform'] {
  const used = new Set(existing.map((row) => row.platform));
  return SOCIAL_PLATFORMS.find((platform) => !used.has(platform)) ?? 'other';
}
