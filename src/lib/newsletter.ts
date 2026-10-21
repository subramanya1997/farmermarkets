/**
 * Newsletter signup with double opt-in.
 *
 * 1. `POST /api/newsletter/subscribe` stores a `pending` row and emails a
 *    confirmation link. Nothing else is ever sent to a pending address.
 * 2. `/newsletter/confirm?token=…` shows a button that posts the token to
 *    `/api/newsletter/confirm`. A button rather than confirming on GET, because
 *    mail scanners open links in emails and would otherwise confirm for the
 *    reader.
 * 3. `/newsletter/unsubscribe?token=…` works the same way, and
 *    `/api/newsletter/unsubscribe` also accepts RFC 8058 one-click POSTs from
 *    mail clients' own unsubscribe buttons.
 *
 * The `newsletter_subscribers` table is the record of consent. Confirmed
 * addresses are mirrored to Resend contacts (in `RESEND_NEWSLETTER_SEGMENT_ID`
 * when set) so issues can be sent as Resend broadcasts.
 */

import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { Resend } from 'resend';
import { absoluteUrl } from './site';

export const NEWSLETTER_SOURCES = ['home', 'blog_index', 'blog_post', 'city', 'market'] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

/** How long a confirmation link works. */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A repeat signup inside this window does not send another email. */
export const CONFIRM_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Tokens are 43 base64url characters; anything else is rejected before a query. */
export function isWellFormedToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function confirmUrl(token: string): string {
  return absoluteUrl(`/newsletter/confirm?token=${token}`);
}

export function unsubscribeUrl(token: string): string {
  return absoluteUrl(`/newsletter/unsubscribe?token=${token}`);
}

interface MailConfig {
  resend: Resend;
  from: string;
}

/**
 * Null when Resend is not configured; the subscribe route turns that into a
 * 503. The site has one sender, `DISCOVERY_FROM_EMAIL`, shared with the
 * discovery and operator notifications, so it must be on a domain verified
 * in Resend.
 */
export function newsletterMailConfig(): MailConfig | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.DISCOVERY_FROM_EMAIL;
  if (!apiKey || !from) return null;
  return { resend: new Resend(apiKey), from };
}

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

/** The shared card layout; `body` is trusted HTML built in this file. */
function emailLayout({ heading, body, footer }: { heading: string; body: string; footer: string }): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border-radius:12px;padding:32px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#15803d">Farmer Markets</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${heading}</h1>
      ${body}
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;text-align:center">${footer}</p>
  </div>
</body></html>`;
}

const P = 'style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46"';
const BUTTON = 'style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:999px"';
const LINK = 'style="color:#15803d"';

export function confirmationEmail({ confirm, unsubscribe }: { confirm: string; unsubscribe: string }): EmailContent {
  return {
    subject: 'Confirm your Farmer Markets subscription',
    text: [
      'Please confirm your subscription to the Farmer Markets newsletter.',
      '',
      `Confirm here: ${confirm}`,
      '',
      'You will get markets near you and what is in season, no more than once a week.',
      '',
      'If you did not sign up, ignore this email and you will not hear from us again.',
      `To block future signups for this address: ${unsubscribe}`,
    ].join('\n'),
    html: emailLayout({
      heading: 'Confirm your subscription',
      body: `<p ${P}>You asked to get markets near you and what is in season, no more than once a week. Tap the button to confirm.</p>
      <a href="${confirm}" ${BUTTON}>Confirm my subscription</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a">The link works for 7 days. If you did not sign up, ignore this email and you will not hear from us again.</p>`,
      footer: `<a href="${unsubscribe}" style="color:#a1a1aa">Never email this address</a>`,
    }),
  };
}

export function welcomeEmail({ unsubscribe, zip }: { unsubscribe: string; zip?: string | null }): EmailContent {
  const home = absoluteUrl('/');
  const inSeason = absoluteUrl('/blog/what-produce-is-in-season');
  const snap = absoluteUrl('/farmers-markets/snap-ebt');
  const near = zip ? `markets near ${zip}` : 'markets near you';
  return {
    subject: "You're subscribed to Farmer Markets",
    text: [
      "You're in. Thanks for confirming.",
      '',
      `Once a week at most, we will send ${near} and what is in season.`,
      '',
      'While you wait for the first one:',
      `Find a market open near you: ${home}`,
      `What produce is in season right now: ${inSeason}`,
      `Markets that take SNAP and EBT: ${snap}`,
      '',
      `Unsubscribe any time: ${unsubscribe}`,
    ].join('\n'),
    html: emailLayout({
      heading: "You're subscribed",
      body: `<p ${P}>Thanks for confirming. Once a week at most, we will send ${near} and what is in season.</p>
      <p ${P}>While you wait for the first one:</p>
      <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.9;color:#3f3f46">
        <li><a href="${inSeason}" ${LINK}>What produce is in season right now</a></li>
        <li><a href="${snap}" ${LINK}>Markets that take SNAP and EBT</a></li>
      </ul>
      <a href="${home}" ${BUTTON}>Find a market near you</a>`,
      footer: `You are getting this because you subscribed at farmermarkets.app. <a href="${unsubscribe}" style="color:#a1a1aa">Unsubscribe</a>`,
    }),
  };
}

export async function sendConfirmationEmail(
  mail: MailConfig,
  { email, confirmToken, unsubscribeToken }: { email: string; confirmToken: string; unsubscribeToken: string },
) {
  const content = confirmationEmail({ confirm: confirmUrl(confirmToken), unsubscribe: unsubscribeUrl(unsubscribeToken) });
  const { error } = await mail.resend.emails.send({ from: mail.from, to: email, ...content });
  if (error) throw new Error(`Resend send failed: ${error.message}`);
}

/** The first newsletter email, sent once a subscription is confirmed. Best effort. */
export async function sendWelcomeEmail(
  { email, unsubscribeToken, zip }: { email: string; unsubscribeToken: string; zip?: string | null },
) {
  const mail = newsletterMailConfig();
  if (!mail) return;
  const unsubscribe = unsubscribeUrl(unsubscribeToken);
  try {
    const { error } = await mail.resend.emails.send({
      from: mail.from,
      to: email,
      ...welcomeEmail({ unsubscribe, zip }),
      // One-click unsubscribe in Gmail and Apple Mail (RFC 8058); the API
      // route accepts the POST these headers point mail clients at.
      headers: {
        'List-Unsubscribe': `<${absoluteUrl(`/api/newsletter/unsubscribe?token=${unsubscribeToken}`)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error('Newsletter welcome email failed', error);
  }
}

/**
 * Mirror a subscriber's state to Resend contacts. Best effort: the database
 * row is the record, so a Resend outage never fails a confirm or unsubscribe.
 */
export async function syncResendContact(email: string, unsubscribed: boolean) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const resend = new Resend(apiKey);
  const segmentId = process.env.RESEND_NEWSLETTER_SEGMENT_ID;

  try {
    if (unsubscribed) {
      const { error } = await resend.contacts.update({ email, unsubscribed: true });
      // A contact that never reached Resend has nothing to unsubscribe.
      if (error && error.name !== 'not_found') throw new Error(error.message);
      return;
    }
    const { error } = await resend.contacts.create({
      email,
      unsubscribed: false,
      ...(segmentId ? { segments: [{ id: segmentId }] } : {}),
    });
    if (!error) return;
    // Already a contact (for example, re-subscribing): just switch it back on.
    const update = await resend.contacts.update({ email, unsubscribed: false });
    if (update.error) throw new Error(update.error.message);
  } catch (error) {
    console.error('Resend contact sync failed', error);
  }
}
