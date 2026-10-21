import { marketService } from '../data';
import { after, NextResponse } from 'next/server';
import { getPostHogServer } from '@/lib/posthogServer';

function recordRequestMetrics(startedAt: number, statusCode: '200' | '400' | '404' | '500') {
  const posthog = getPostHogServer();
  if (!posthog) return;

  const attributes = { method: 'GET', route: '/api/markets/[slug]', status_code: statusCode };
  posthog.metrics.count('http.requests', 1, { attributes });
  posthog.metrics.histogram('http.request.duration', Date.now() - startedAt, {
    unit: 'ms',
    attributes,
  });
  after(() => posthog.metrics.flush().catch((error) => {
    console.error('PostHog metrics flush failed', error);
  }));
}

// GET /api/markets/[slug] - Get a specific market
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const startedAt = Date.now();
  const resolvedParams = await params;
  const marketSlug = resolvedParams.slug;
  try {
    if (!marketSlug) {
      recordRequestMetrics(startedAt, '400');
      return NextResponse.json(
        { error: 'Market slug is required' },
        { status: 400 }
      );
    }
    
    const market = await marketService.getMarketBySlug(marketSlug);
    
    if (!market) {
      recordRequestMetrics(startedAt, '404');
      return NextResponse.json(
        { error: 'Market not found' },
        { status: 404 }
      );
    }
    
    recordRequestMetrics(startedAt, '200');
    return NextResponse.json({ data: market });
  } catch (error) {
    console.error('Error fetching market:', error);
    recordRequestMetrics(startedAt, '500');
    return NextResponse.json(
      { error: 'Failed to fetch market' },
      { status: 500 }
    );
  }
}
