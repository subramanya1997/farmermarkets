import { marketService } from '../data';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/markets/[id] - Get a specific market
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const marketId = resolvedParams.id;
  try {
    if (!marketId) {
      return NextResponse.json(
        { error: 'Market ID is required' },
        { status: 400 }
      );
    }
    
    const market = await marketService.getMarketById(marketId);
    
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