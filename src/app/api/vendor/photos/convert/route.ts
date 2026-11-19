/**
 * Converts a vendor's just-uploaded HEIC/HEIF photo to JPEG.
 *
 * Vendor photos join the profile form in the browser and are only checked
 * when the profile is sent, so the conversion runs right after the upload:
 * the vendor sees the JPEG in the form, and the original is deleted. The
 * profile schema refuses any `.heic`/`.heif` file that skipped this step.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/organizer';
import { requestOriginAllowed } from '@/lib/formGuards';
import { webPhotoForUpload } from '@/lib/photoConvert';
import { isHeicPathname } from '@/lib/photoTypes';
import { ensureVendor, vendorPhotoPathPrefix } from '@/lib/vendors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  url: z.string().url().max(1000),
  pathname: z.string().min(1).max(500),
});

export async function POST(request: Request) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user?.emailVerified) return NextResponse.json({ error: 'Sign in to upload photos.' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isHeicPathname(parsed.data.pathname)) {
    return NextResponse.json({ error: 'That upload could not be saved.' }, { status: 400 });
  }
  const vendor = await ensureVendor(user);
  const { pathname } = parsed.data;
  const prefix = vendorPhotoPathPrefix(vendor.id);
  if (!pathname.startsWith(prefix) || /[\/\\]|\.\./.test(pathname.slice(prefix.length))) {
    return NextResponse.json({ error: 'Upload path does not match your account.' }, { status: 400 });
  }

  const result = await webPhotoForUpload(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json(result.photo, { headers: { 'Cache-Control': 'private, no-store' } });
}
