import { marketService } from './data';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/markets - Get all markets (with pagination)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const search = searchParams.get('search') || '';
  const state = searchParams.get('state') || '';
  
  try {
    // Get markets with all the filters applied through the service
    const result = await marketService.getMarkets({
      page,
      limit,
      search,
      state
    });
    
    // Return response with pagination metadata
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching markets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch markets' }, 
      { status: 500 }
    );
  }
} 