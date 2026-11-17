/**
 * Emails for vendor accounts: invites, review alerts, decisions and the
 * admin's announcements. Sent through the same sender as organizer mail
 * (`sendOrganizerEmail`), so `ORGANIZER_EMAIL_LOG_ONLY=1` prints these too.
 *
 * Anything a vendor or organizer typed is escaped before it reaches HTML.
 */
import 'server-only';
import { BUTTON, EMAIL_P, LINK, emailLayout } from './newsletter';
import { escapeHtml } from './organizerEmails';
import { absoluteUrl } from './site';

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const VENDOR_FOOTER = 'You are getting this because this address has a vendor account on Farmer Markets.';

/** Where an invited or returning vendor starts: sign in with a code, then the vendor area. */
export function vendorSignInUrl(): string {
  return absoluteUrl('/sign-in?next=%2Fvendor');
}

export function vendorInviteEmail(input: { businessName?: string; marketNames: string[] }): EmailContent {
  const url = vendorSignInUrl();
  const who = input.businessName?.trim();
  const where =
    input.marketNames.length === 0
      ? ''
      : input.marketNames.length === 1
        ? ` We have noted that you sell at ${input.marketNames[0]}.`
        : ` We have noted ${input.marketNames.length} markets you sell at.`;
  const lead = `${who ? `${who} has` : 'You have'} been invited to set up a free vendor page on Farmer Markets, the directory shoppers use to find farmers markets.${where}`;
  return {
    subject: 'Set up your vendor page on Farmer Markets',
    text: `${lead}\n\nAdd what you sell, a few photos and the markets you are at. It takes about five minutes on a phone.\n\nOpen this link and enter this email address. We will send you a code to sign in, no password needed:\n${url}`,
    html: emailLayout({
      heading: 'Set up your vendor page',
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
<p ${EMAIL_P}>Add what you sell, a few photos and the markets you are at. It takes about five minutes on a phone.</p>
<p ${EMAIL_P}><a href="${escapeHtml(url)}" ${BUTTON}>Start your vendor page</a></p>
<p ${EMAIL_P}>Enter this email address and we will send you a code to sign in. No password needed.</p>`,
      footer: 'You are getting this because Farmer Markets was in touch with you about selling at a farmers market.',
    }),
  };
}

export function vendorProfileAlertEmail(input: { vendorName: string; accountEmail: string; firstTime: boolean; reviewUrl: string }): EmailContent {
  const what = input.firstTime ? 'new vendor profile' : 'vendor profile update';
  return {
    subject: `[Farmer Markets] ${input.firstTime ? 'New vendor' : 'Vendor update'}: ${input.vendorName}`,
    text: `${input.vendorName} <${input.accountEmail}> sent a ${what}.\n\nReview it: ${input.reviewUrl}`,
    html: emailLayout({
      heading: `A ${what} to review`,
      body: `<p ${EMAIL_P}><strong>${escapeHtml(input.vendorName)}</strong> (${escapeHtml(input.accountEmail)}) sent a ${what}.</p>
<p ${EMAIL_P}><a href="${escapeHtml(input.reviewUrl)}" ${BUTTON}>Review it</a></p>`,
      footer: 'Sent to Farmer Markets admins.',
    }),
  };
}

export function vendorProfileDecisionEmail(input: { approved: boolean; vendorName: string; slug: string; note?: string | null }): EmailContent {
  const pageUrl = absoluteUrl(`/vendors/${input.slug}`);
  const editUrl = absoluteUrl('/vendor/profile');
  const subject = input.approved ? `${input.vendorName} is live on Farmer Markets` : `About your vendor profile for ${input.vendorName}`;
  const lead = input.approved
    ? 'Your vendor profile is published. Next, pick the markets you sell at so shoppers can find you there.'
    : 'We could not publish your vendor profile yet. You can fix it and send it again.';
  const cta = input.approved ? { href: absoluteUrl('/vendor/markets'), label: 'Pick your markets' } : { href: editUrl, label: 'Edit your profile' };
  const note = input.note?.trim();
  return {
    subject,
    text: `${lead}${note ? `\n\nNote from our team: ${note}` : ''}\n\n${cta.label}: ${cta.href}${input.approved ? `\nYour page: ${pageUrl}` : ''}`,
    html: emailLayout({
      heading: escapeHtml(subject),
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
${note ? `<p ${EMAIL_P}><strong>Note from our team:</strong> ${escapeHtml(note)}</p>` : ''}
<p ${EMAIL_P}><a href="${escapeHtml(cta.href)}" ${BUTTON}>${cta.label}</a></p>
${input.approved ? `<p ${EMAIL_P}>Your page: <a href="${escapeHtml(pageUrl)}" ${LINK}>${escapeHtml(pageUrl)}</a></p>` : ''}`,
      footer: VENDOR_FOOTER,
    }),
  };
}

/** To the people who decide an application: the market's organizers, or the admins. */
export function applicationAlertEmail(input: {
  audience: 'organizer' | 'admin';
  vendorName: string;
  marketName: string;
  waiting: number;
  reviewUrl: string;
}): EmailContent {
  const more = input.waiting > 1 ? ` ${input.waiting} applications are waiting in all.` : '';
  const lead = `${input.vendorName} asked to be listed as a vendor at ${input.marketName}.${more}`;
  return {
    subject: `${input.audience === 'admin' ? '[Farmer Markets] ' : ''}Vendor application for ${input.marketName}`,
    text: `${lead}\n\nSee their profile and documents, then approve or deny:\n${input.reviewUrl}`,
    html: emailLayout({
      heading: 'A vendor applied',
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
<p ${EMAIL_P}>See their profile and documents, then approve or deny.</p>
<p ${EMAIL_P}><a href="${escapeHtml(input.reviewUrl)}" ${BUTTON}>Review the application</a></p>`,
      footer:
        input.audience === 'admin'
          ? 'Sent to Farmer Markets admins.'
          : 'You are getting this because you manage this market on Farmer Markets. We send at most one of these a day per market.',
    }),
  };
}

export function applicationDecisionEmail(input: {
  approved: boolean;
  /** An approved vendor being taken off the market later. */
  removed?: boolean;
  marketName: string;
  marketSlug: string;
  note?: string | null;
}): EmailContent {
  const subject = input.approved
    ? `You are listed at ${input.marketName}`
    : input.removed
      ? `You are no longer listed at ${input.marketName}`
      : `About your application to ${input.marketName}`;
  const lead = input.approved
    ? `Your application was approved. You now appear on the ${input.marketName} page on Farmer Markets.`
    : input.removed
      ? `${input.marketName} removed you from its vendor list on Farmer Markets.`
      : `Your application to ${input.marketName} was not approved.`;
  const cta = input.approved
    ? { href: absoluteUrl(`/markets/${input.marketSlug}`), label: 'See the market page' }
    : { href: absoluteUrl('/vendor/markets'), label: 'Open your markets' };
  const note = input.note?.trim();
  return {
    subject,
    text: `${lead}${note ? `\n\nNote: ${note}` : ''}\n\n${cta.label}: ${cta.href}`,
    html: emailLayout({
      heading: escapeHtml(subject),
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
${note ? `<p ${EMAIL_P}><strong>Note:</strong> ${escapeHtml(note)}</p>` : ''}
<p ${EMAIL_P}><a href="${escapeHtml(cta.href)}" ${BUTTON}>${cta.label}</a></p>`,
      footer: VENDOR_FOOTER,
    }),
  };
}

export function documentDeniedEmail(input: { documentLabel: string; marketName: string; note?: string | null }): EmailContent {
  const url = absoluteUrl('/vendor/markets');
  const lead = `${input.marketName} could not accept your document "${input.documentLabel}". You can upload a new one and attach it to your application.`;
  const note = input.note?.trim();
  return {
    subject: `A document needs another look for ${input.marketName}`,
    text: `${lead}${note ? `\n\nNote: ${note}` : ''}\n\nOpen your markets: ${url}`,
    html: emailLayout({
      heading: 'A document needs another look',
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
${note ? `<p ${EMAIL_P}><strong>Note:</strong> ${escapeHtml(note)}</p>` : ''}
<p ${EMAIL_P}><a href="${escapeHtml(url)}" ${BUTTON}>Open your markets</a></p>`,
      footer: VENDOR_FOOTER,
    }),
  };
}

/** An admin's message to vendors. `body` is plain text; blank lines make paragraphs. */
export function announcementEmail(input: { subject: string; body: string; unsubscribeUrl: string }): EmailContent {
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  return {
    subject: input.subject,
    text: `${paragraphs.join('\n\n')}\n\nStop these emails: ${input.unsubscribeUrl}`,
    html: emailLayout({
      heading: escapeHtml(input.subject),
      body: paragraphs.map((paragraph) => `<p ${EMAIL_P}>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`).join('\n'),
      footer: `${VENDOR_FOOTER} <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#a1a1aa">Stop these emails</a>`,
    }),
  };
}
