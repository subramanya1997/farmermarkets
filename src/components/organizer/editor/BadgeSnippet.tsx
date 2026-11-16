'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SITE = 'https://www.farmermarkets.app';

const FONT = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The badge as one self-contained <a>: inline styles only, no scripts, no
 * images, so it pastes cleanly into Squarespace, Wix or WordPress and cannot
 * break the organizer's site. The "F" mark is a styled letter, not an image.
 */
export function badgeHtml(slug: string, marketName: string): string {
  const href = `${SITE}/markets/${encodeURIComponent(slug)}`;
  const title = `${marketName} on Farmer Markets`.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
  return [
    `<a href="${href}" title="${title}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px 8px 8px;border:1px solid #d4d4d8;border-radius:999px;background:#ffffff;color:#18181b;text-decoration:none;font-family:${FONT};line-height:1.15;box-shadow:0 1px 2px rgba(0,0,0,0.05);">`,
    `<span style="display:inline-block;width:30px;height:30px;border-radius:999px;background:#15803d;color:#ffffff;font-size:15px;font-weight:700;line-height:30px;text-align:center;">F</span>`,
    `<span style="display:inline-block;text-align:left;"><span style="display:block;font-size:11px;color:#52525b;">Find us on</span><span style="display:block;font-size:14px;font-weight:700;color:#166534;">Farmer Markets</span></span>`,
    `</a>`,
  ].join('\n');
}

export function BadgeSnippet({ slug, marketName }: { slug: string; marketName: string }) {
  const html = badgeHtml(slug, marketName);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
    } catch {
      // Clipboard can be blocked (older browsers, iframes); select the text instead.
      const code = document.getElementById('badge-snippet-code');
      if (code) window.getSelection()?.selectAllChildren(code);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold tracking-tight">Add a badge to your website</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        It links visitors to your listing here, so they can check hours and directions before they come.
      </p>

      <div className="mt-5 flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-8 dark:border-zinc-800 dark:bg-zinc-100">
        {/* The same markup organizers paste, rendered as a preview. */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">HTML to paste</p>
        <Button type="button" variant="outline" onClick={() => void copy()} className="h-11 px-4">
          {copied ? <Check aria-hidden="true" className="text-green-700" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy code'}
        </Button>
      </div>
      <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 dark:border-zinc-800">
        <code id="badge-snippet-code" className="break-all whitespace-pre-wrap">
          {html}
        </code>
      </pre>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
        {copied ? 'Copied. Paste it into an HTML or embed block on your site.' : 'Paste it into an HTML or embed block on your site.'}
      </p>
    </section>
  );
}
