import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/organizer';
import { deskVendor } from '@/lib/vendors';
import { vendorPagePublic } from '@/lib/vendorRules';
import { qrPng, qrSvg } from '@/lib/vendorQr';

/** The signed-in vendor's own stall QR code as a download: `?format=png` (default) or `svg`. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user?.emailVerified) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const vendor = await deskVendor(user);
  if (!vendor || !vendorPagePublic({ hasLiveProfile: vendor.profile !== null, suspended: vendor.suspendedAt !== null })) {
    return NextResponse.json({ error: 'Your QR code is ready once your page is live.' }, { status: 404 });
  }
  const svg = request.nextUrl.searchParams.get('format') === 'svg';
  const filename = `${vendor.slug}-qr.${svg ? 'svg' : 'png'}`;
  const headers = {
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (svg) return new NextResponse(await qrSvg(vendor.slug), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
  return new NextResponse(new Uint8Array(await qrPng(vendor.slug)), { headers: { ...headers, 'Content-Type': 'image/png' } });
}
