/**
 * The "we got it" email sent to a visitor who filled out a form and left an
 * address (`/api/discovery`: the market operators form and the feedback
 * dialog).
 *
 * It deliberately repeats nothing the visitor typed. Anyone can put any
 * address in the form, so an email that echoed the message would let the site
 * be used to deliver arbitrary text to a stranger's inbox.
 */

import 'server-only';
import { EMAIL_P, emailLayout } from './newsletter';
import { absoluteUrl } from './site';

export type AcknowledgementKind = 'get_listed' | 'update_listing' | 'feedback';

interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

const COPY: Record<AcknowledgementKind, { subject: string; heading: string; lead: string; next: string }> = {
  get_listed: {
    subject: 'We got your request to list a market',
    heading: 'We got your request',
    lead: 'Thanks for telling us about your market. Your request to add it to Farmer Markets has reached us.',
    next: 'A person reviews every request. We will reply to this address if we need anything else, and again once the listing is live.',
  },
  update_listing: {
    subject: 'We got your request about a listing',
    heading: 'We got your request',
    lead: 'Thanks for getting in touch about a listing on Farmer Markets. Your request to claim or correct it has reached us.',
    next: 'A person reviews every request. We will reply to this address if we need anything else, and again once the listing is updated.',
  },
  feedback: {
    subject: 'We got your feedback',
    heading: 'Thanks for the feedback',
    lead: 'Your message to Farmer Markets has reached us. We read every one.',
    next: 'If there is anything to follow up, we will reply to this address.',
  },
};

export function acknowledgementEmail(kind: AcknowledgementKind): EmailContent {
  const { subject, heading, lead, next } = COPY[kind];
  const home = absoluteUrl('/');
  const notYou = 'If you did not send this, you can ignore this email. We will not write again.';
  return {
    subject,
    text: [lead, '', next, '', 'Have something to add? Just reply to this email.', '', notYou, '', `Farmer Markets: ${home}`].join('\n'),
    html: emailLayout({
      heading,
      body: `<p ${EMAIL_P}>${lead}</p>
      <p ${EMAIL_P}>${next}</p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46">Have something to add? Just reply to this email.</p>`,
      footer: `You are getting this because this address was entered in a form at <a href="${home}" style="color:#a1a1aa">farmermarkets.app</a>. ${notYou}`,
    }),
  };
}
