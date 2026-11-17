'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SITE = 'https://www.farmermarkets.app';

export const BADGE_WIDTH = 200;
export const BADGE_HEIGHT = 52;

const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** The public address of a market's listing. */
export function listingUrl(slug: string): string {
  return `${SITE}/markets/${encodeURIComponent(slug)}`;
}

/**
 * The badge as one short line: a link around an image we host
 * (`public/badge.svg`, the leaf logo and "Find us on Farmer Markets"). No
 * scripts and no styles, so it pastes cleanly into Squarespace, Wix or
 * WordPress, and the badge can be improved later without anyone pasting again.
 */
export function badgeHtml(slug: string, marketName: string): string {
  const alt = escapeAttribute(`Find ${marketName} on Farmer Markets`);
  return `<a href="${listingUrl(slug)}"><img src="${SITE}/badge.svg" alt="${alt}" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}"></a>`;
}

type Copied = 'code' | 'link' | null;

export function BadgeSnippet({ slug, marketName }: { slug: string; marketName: string }) {
  const html = badgeHtml(slug, marketName);
  const link = listingUrl(slug);
  const [copied, setCopied] = useState<Copied>(null);

  async function copy(what: Exclude<Copied, null>, text: string, fallbackId: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked (older browsers, iframes); select the text instead.
      const target = document.getElementById(fallbackId);
      if (target) window.getSelection()?.selectAllChildren(target);
      return;
    }
    setCopied(what);
    window.setTimeout(() => setCopied((current) => (current === what ? null : current)), 2000);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold tracking-tight">Add a badge to your website</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        It links visitors to your listing here, so they can check hours and directions before they come.
      </p>

      <div className="mt-5 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-6 dark:border-zinc-800 dark:bg-zinc-100">
        {/* The same image the pasted code shows, served from this site. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.svg" alt="Find us on Farmer Markets" width={BADGE_WIDTH} height={BADGE_HEIGHT} />
      </div>

      <code
        id="badge-snippet-code"
        className="mt-4 block rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed break-all text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
      >
        {html}
      </code>
      <Button
        type="button"
        onClick={() => void copy('code', html, 'badge-snippet-code')}
        className="mt-3 h-11 w-full bg-green-700 text-white hover:bg-green-800 sm:h-10 dark:bg-green-700 dark:hover:bg-green-600"
      >
        {copied === 'code' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied === 'code' ? 'Copied' : 'Copy badge code'}
      </Button>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {copied === 'code' ? 'Copied. Paste it into an HTML or embed block on your site.' : 'Paste it into an HTML or embed block on your site.'}
      </p>

      <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Just need the link?</p>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">For social profiles, emails and anywhere code does not paste.</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            id="badge-listing-link"
            className="min-w-0 flex-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 font-mono text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            {link}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copy('link', link, 'badge-listing-link')}
            className="h-9 shrink-0 px-3"
            aria-label={copied === 'link' ? 'Link copied' : 'Copy link to your listing'}
          >
            {copied === 'link' ? <Check aria-hidden="true" className="text-green-700" /> : <Copy aria-hidden="true" />}
            {copied === 'link' ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </section>
  );
}
