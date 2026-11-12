import { NextRequest, NextResponse } from 'next/server';
import { getMarketsNear, NEAR_ME_RADIUS_MILES } from '@/lib/nearMe';

export const runtime = 'nodejs';

/**
 * GET /api/near-me?lat=..&lon=..
 *
 * The closest markets to a point, nearest first, for the near-me page. The
 * browser sends coordinates rounded to two decimals (about a kilometre), which
 * is all a "markets within 60 miles" answer needs.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const latParam = params.get('lat');
  const lonParam = params.get('lon');
  const lat = Number(latParam);
  const lon = Number(lonParam);

  if (
    latParam === null ||
    lonParam === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return NextResponse.json(
      { error: 'lat must be between -90 and 90 and lon must be between -180 and 180' },
      { status: 400 }
    );
  }

  try {
    const markets = await getMarketsNear(lat, lon);
    return NextResponse.json(
      { markets, radiusMiles: NEAR_ME_RADIUS_MILES },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' } }
    );
  } catch (error) {
    console.error('Error finding markets near a point:', error);
    return NextResponse.json({ error: 'Failed to find nearby markets' }, { status: 500 });
  }
}
