import { marketService, slimMarket } from './data';
import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
/**
 * Raised from 500 so the map/filter explorer can pull the dataset in ~9
 * parallel requests instead of 18 sequential ones. Pair it with `fields=slim`
 * (below) — a 1,000-record page of full records is still a multi-MB response.
 */
const MAX_LIMIT = 1000;

type ParsedCoordinates =
  | { userLat?: number; userLon?: number; error?: undefined }
  | { error: string; userLat?: undefined; userLon?: undefined };

function parsePositiveIntegerParam(
  value: string | null,
  fallback: number,
  max = Number.MAX_SAFE_INTEGER
) {
  if (value === null) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

function parseCoordinates(latParam: string | null, lonParam: string | null): ParsedCoordinates {
  if (latParam === null && lonParam === null) {
    return {};
  }

  if (latParam === null || lonParam === null) {
    return { error: 'Both lat and lon are required when sorting by distance' };
  }

  const userLat = Number(latParam);
  const userLon = Number(lonParam);

  if (
    !Number.isFinite(userLat) ||
    !Number.isFinite(userLon) ||
    Math.abs(userLat) > 90 ||
    Math.abs(userLon) > 180
  ) {
    return { error: 'lat must be between -90 and 90 and lon must be between -180 and 180' };
  }

  return { userLat, userLon };
}

// GET /api/markets - Get all markets (with pagination)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parsePositiveIntegerParam(searchParams.get('page'), DEFAULT_PAGE);
  const limit = parsePositiveIntegerParam(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);
  const search = searchParams.get('search') || '';
  const country = searchParams.get('country') || '';
  const state = searchParams.get('state') || '';
  // `fields=slim` returns only what the client map/filter UI reads. Anything
  // else (including no value) keeps the full record, so existing consumers of
  // this endpoint are unaffected.
  const slim = searchParams.get('fields') === 'slim';

  // Get user location for distance sorting
  const coordinates = parseCoordinates(searchParams.get('lat'), searchParams.get('lon'));
  if (coordinates.error) {
    return NextResponse.json(
      { error: coordinates.error },
      { status: 400 }
    );
  }

  try {
    // Get markets with all the filters applied through the service
    const result = await marketService.getMarkets({
      page,
      limit,
      search,
      country,
      state,
      userLat: coordinates.userLat,
      userLon: coordinates.userLon,
    });

    // Return response with pagination metadata
    return NextResponse.json(
      slim ? { ...result, data: result.data.map(slimMarket) } : result
    );
  } catch (error) {
    console.error('Error fetching markets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}
