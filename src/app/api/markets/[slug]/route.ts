import { marketService } from '../data';
import { NextResponse } from 'next/server';

// GET /api/markets/[slug] - Get a specific market
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const resolvedParams = await params;
  const marketSlug = resolvedParams.slug;
  try {
    if (!marketSlug) {
      return NextResponse.json(
        { error: 'Market slug is required' },
        { status: 400 }
      );
    }
    
    const market = await marketService.getMarketBySlug(marketSlug);
    
    if (!market) {
      return NextResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ data: market });
  } catch (error) {
    console.error('Error fetching market:', error);
    return NextResponse.json(
      { error: 'Failed to fetch market' },
      { status: 500 }
    );
  }
}
