/**
 * Emails for market organizer accounts: sign-up verification, password
 * reset, the admin's "something needs review" alert, and the organizer's
 * decision notice.
 *
 * Emails to organizers only ever go to the address they verified, and repeat
 * nothing a stranger could inject: the only free text is the admin's own
 * review note.
 */
import 'server-only';
import { BUTTON, EMAIL_P, LINK, emailLayout, newsletterMailConfig } from './newsletter';
import { absoluteUrl } from './site';

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const FOOTER = 'You are getting this because someone used this address for a market organizer account on Farmer Markets.';
/** The sign-in code goes to organizers and vendors alike. */
const SIGN_IN_FOOTER = 'You are getting this because someone used this address to sign in to Farmer Markets.';

export function verificationEmail(url: string): EmailContent {
  return {
    subject: 'Confirm your email for Farmer Markets',
    text: `Confirm your email to finish setting up your market organizer account:\n\n${url}\n\nThe link works for 24 hours. If you did not sign up, ignore this email.`,
    html: emailLayout({
      heading: 'Confirm your email',
      body: `<p ${EMAIL_P}>Confirm your email to finish setting up your market organizer account. Then you can claim your market and keep its listing up to date.</p>
<p ${EMAIL_P}><a href="${escapeHtml(url)}" ${BUTTON}>Confirm email</a></p>
<p ${EMAIL_P}>The link works for 24 hours. If you did not sign up, you can ignore this email.</p>`,
      footer: FOOTER,
    }),
  };
}

export function signInCodeEmail(code: string): EmailContent {
  return {
    subject: `${code} is your Farmer Markets sign-in code`,
    text: `Your sign-in code for Farmer Markets is ${code}\n\nEnter it on the page where you asked for it. The code works for 10 minutes. If you did not ask for it, ignore this email.`,
    html: emailLayout({
      heading: 'Your sign-in code',
      body: `<p ${EMAIL_P}>Enter this code on the page where you asked for it:</p>
<p style="margin:0 0 16px;font-size:32px;font-weight:700;letter-spacing:8px;color:#15803d;font-family:ui-monospace,Menlo,monospace">${escapeHtml(code)}</p>
<p ${EMAIL_P}>The code works for 10 minutes. If you did not ask for it, you can ignore this email.</p>`,
      footer: SIGN_IN_FOOTER,
    }),
  };
}

/** Sent when the outreach bot gives someone access to a market, if it asks us to. */
export function managerInviteEmail(input: { marketName: string; marketSlug: string }): EmailContent {
  const claimUrl = absoluteUrl(`/markets/${input.marketSlug}/claim`);
  return {
    subject: `You can now update ${input.marketName} on Farmer Markets`,
    text: `You have been set up to manage the ${input.marketName} listing on Farmer Markets, so you can update its hours and details and add photos of the market and its vendors.\n\nOpen this link and enter this email address. We will send you a code to sign in, no password needed:\n${claimUrl}`,
    html: emailLayout({
      heading: `Update ${escapeHtml(input.marketName)}`,
      body: `<p ${EMAIL_P}>You have been set up to manage the <strong>${escapeHtml(input.marketName)}</strong> listing on Farmer Markets, so you can update its hours and details and add photos of the market and its vendors.</p>
<p ${EMAIL_P}><a href="${escapeHtml(claimUrl)}" ${BUTTON}>Open your listing</a></p>
<p ${EMAIL_P}>Enter this email address and we will send you a code to sign in. No password needed.</p>`,
      footer: 'You are getting this because you were in touch with Farmer Markets about this market.',
    }),
  };
}

export function resetPasswordEmail(url: string): EmailContent {
  return {
    subject: 'Reset your Farmer Markets password',
    text: `Use this link to choose a new password:\n\n${url}\n\nThe link works for 1 hour. If you did not ask for this, ignore this email; your password stays the same.`,
    html: emailLayout({
      heading: 'Reset your password',
      body: `<p ${EMAIL_P}>Use the button below to choose a new password for your market organizer account.</p>
<p ${EMAIL_P}><a href="${escapeHtml(url)}" ${BUTTON}>Choose a new password</a></p>
<p ${EMAIL_P}>The link works for 1 hour. If you did not ask for this, ignore this email and your password stays the same.</p>`,
      footer: FOOTER,
    }),
  };
}

export function existingAccountEmail(): EmailContent {
  const signIn = absoluteUrl('/sign-in');
  const reset = absoluteUrl('/forgot-password');
  return {
    subject: 'You already have a Farmer Markets account',
    text: `Someone tried to sign up with this email, but it already has an organizer account.\n\nSign in: ${signIn}\nForgot your password? ${reset}\n\nIf this was not you, you can ignore this email.`,
    html: emailLayout({
      heading: 'You already have an account',
      body: `<p ${EMAIL_P}>Someone tried to sign up with this email, but it already has a market organizer account.</p>
<p ${EMAIL_P}><a href="${escapeHtml(signIn)}" ${BUTTON}>Sign in</a></p>
<p ${EMAIL_P}>Forgot your password? <a href="${escapeHtml(reset)}" ${LINK}>Choose a new one</a>. If this was not you, you can ignore this email.</p>`,
      footer: FOOTER,
    }),
  };
}

export type ReviewKind = 'claim' | 'change';

export function adminReviewAlertEmail(input: {
  kind: ReviewKind;
  marketName: string;
  marketSlug: string;
  organizerName: string;
  organizerEmail: string;
  summary: string[];
  reviewUrl: string;
}): EmailContent {
  const what = input.kind === 'claim' ? 'claim' : 'listing update';
  const lines = input.summary.map((line) => `- ${line}`).join('\n');
  return {
    subject: `[Farmer Markets] New ${what}: ${input.marketName}`,
    text: `${input.organizerName} <${input.organizerEmail}> sent a ${what} for ${input.marketName}.\n\n${lines}\n\nReview it: ${input.reviewUrl}\nListing: ${absoluteUrl(`/markets/${input.marketSlug}`)}`,
    html: emailLayout({
      heading: `New ${what} to review`,
      body: `<p ${EMAIL_P}><strong>${escapeHtml(input.organizerName)}</strong> (${escapeHtml(input.organizerEmail)}) sent a ${what} for <a href="${escapeHtml(absoluteUrl(`/markets/${input.marketSlug}`))}" ${LINK}>${escapeHtml(input.marketName)}</a>.</p>
${input.summary.length ? `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.6;color:#3f3f46">${input.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
<p ${EMAIL_P}><a href="${escapeHtml(input.reviewUrl)}" ${BUTTON}>Review it</a></p>`,
      footer: 'Sent to Farmer Markets admins.',
    }),
  };
}

export function decisionEmail(input: {
  kind: ReviewKind;
  approved: boolean;
  marketName: string;
  marketSlug: string;
  note?: string | null;
}): EmailContent {
  const listingUrl = absoluteUrl(`/markets/${input.marketSlug}`);
  const dashboardUrl = absoluteUrl(`/dashboard/markets/${input.marketSlug}`);
  const subject =
    input.kind === 'claim'
      ? input.approved
        ? `You can now manage ${input.marketName}`
        : `About your claim for ${input.marketName}`
      : input.approved
        ? `Your update to ${input.marketName} is live`
        : `About your update to ${input.marketName}`;
  const lead =
    input.kind === 'claim'
      ? input.approved
        ? `Your claim was approved. You can now update ${input.marketName}'s hours, details and photos.`
        : `We could not approve your claim for ${input.marketName}.`
      : input.approved
        ? `Your changes to ${input.marketName} are published.`
        : `We could not publish your changes to ${input.marketName}.`;
  const cta = input.approved
    ? input.kind === 'claim'
      ? { href: dashboardUrl, label: 'Update your listing' }
      : { href: listingUrl, label: 'See your listing' }
    : { href: dashboardUrl, label: 'Open your dashboard' };
  const note = input.note?.trim();
  return {
    subject,
    text: `${lead}${note ? `\n\nNote from our team: ${note}` : ''}\n\n${cta.label}: ${cta.href}`,
    html: emailLayout({
      heading: subject,
      body: `<p ${EMAIL_P}>${escapeHtml(lead)}</p>
${note ? `<p ${EMAIL_P}><strong>Note from our team:</strong> ${escapeHtml(note)}</p>` : ''}
<p ${EMAIL_P}><a href="${escapeHtml(cta.href)}" ${BUTTON}>${cta.label}</a></p>`,
      footer: 'You are getting this because you manage a market listing on Farmer Markets.',
    }),
  };
}

/** Comma-separated `ADMIN_EMAILS`, falling back to the existing notification address. */
export function adminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || process.env.DISCOVERY_NOTIFICATION_EMAIL || '';
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Sends one email. In local development without Resend it prints the email
 * (links included) to the server console, so sign-up can be tested offline.
 * Returns false when the email could not be sent; callers decide whether
 * that is fatal.
 */
export async function sendOrganizerEmail(to: string | string[], content: EmailContent, replyTo?: string): Promise<boolean> {
  const config = newsletterMailConfig();
  if (!config || process.env.ORGANIZER_EMAIL_LOG_ONLY === '1') {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[organizer email] to=${[to].flat().join(',')} subject="${content.subject}"\n${content.text}`);
      return true;
    }
    console.error('Organizer email not sent: RESEND_API_KEY or DISCOVERY_FROM_EMAIL missing');
    return false;
  }
  const { error } = await config.resend.emails.send({
    from: config.from,
    to,
    subject: content.subject,
    text: content.text,
    html: content.html,
    ...(replyTo ? { replyTo } : {}),
  });
  if (error) {
    console.error('Organizer email failed:', error.name);
    return false;
  }
  return true;
}
