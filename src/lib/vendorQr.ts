/**
 * The stall QR code: a plain black on white code for the vendor's stable
 * scan URL, `/v/<slug>`. Medium error correction and a 4 module quiet zone
 * keep it readable printed small or a little scuffed.
 */
import 'server-only';
import QRCode from 'qrcode';
import { absoluteUrl } from './site';

export function scanPath(slug: string): string {
  return `/v/${slug}`;
}

export function scanUrl(slug: string): string {
  return absoluteUrl(scanPath(slug));
}

const OPTIONS = { errorCorrectionLevel: 'M', margin: 4, color: { dark: '#000000', light: '#ffffff' } } as const;

export function qrSvg(slug: string): Promise<string> {
  return QRCode.toString(scanUrl(slug), { ...OPTIONS, type: 'svg' });
}

/** A PNG big enough to print sharp at about 4 inches. */
export function qrPng(slug: string): Promise<Buffer> {
  return QRCode.toBuffer(scanUrl(slug), { ...OPTIONS, type: 'png', width: 1200 });
}
