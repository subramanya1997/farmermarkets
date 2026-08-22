// @ts-expect-error Bun's test module is available to the configured test runner,
// but this project intentionally does not add Bun's globals to production types.
import { describe, expect, test } from 'bun:test';
import { mergeEnrichment } from './data';

describe('mergeEnrichment', () => {
  test('partial facts preserve source maps and merge payment methods', () => {
    const merged = mergeEnrichment(
      {
        id: '1',
        name: 'Test Market',
        google_maps_url: 'https://www.google.com/maps/place/Test+Market',
        payment: { methods: ['Credit/Debit'] },
      },
      {
        id: '1',
        market_name: 'Test Market',
        verified_at: '2026-08-21',
        verification_scope: 'partial',
        payment: { methods: ['SNAP/EBT'] },
        sources: [{ url: 'https://example.com', title: 'Test Market', fields: ['payment.methods'] }],
      },
      { checked_at: '2026-08-21', status: 'verified_update' },
    );

    expect(merged.google_maps_url).toBe('https://www.google.com/maps/place/Test+Market');
    expect(merged.payment?.methods).toEqual(['SNAP/EBT', 'Credit/Debit']);
    expect(merged.enrichment?.verification_scope).toBe('partial');
  });

  test('phone numbers dedupe by North American digits', () => {
    const merged = mergeEnrichment(
      { id: '1', name: 'Test Market', contact: { phone_numbers: ['(859) 586-6101'] } },
      {
        id: '1',
        market_name: 'Test Market',
        verified_at: '2026-08-21',
        contact: { phone_numbers: ['+1 859 586 6101'] },
        sources: [{ url: 'https://example.com', title: 'Test Market', fields: ['contact.phone_numbers'] }],
      },
      undefined,
    );

    expect(merged.contact?.phone_numbers).toEqual(['+1 859 586 6101']);
  });

  test('rich first-party facts remain available and project positive legacy fields', () => {
    const source = {
      source_ids: ['official-market-page'],
      verified_at: '2026-08-21',
    };
    const merged = mergeEnrichment(
      {
        id: '1',
        name: 'Test Market',
        payment: { methods: ['Cash'] },
        products: { categories: {} },
      },
      {
        id: '1',
        market_name: 'Test Market',
        verified_at: '2026-08-21',
        schema_version: 2,
        first_party: {
          operations: {
            timezone: { value: 'America/Los_Angeles', ...source },
            season: {
              value: { kind: 'dated_range', start_date: '2026-06-03', end_date: '2026-09-30' },
              ...source,
            },
            schedules: [{
              id: 'saturday-main-season',
              value: {
                recurrence: { kind: 'weekly', weekdays: ['saturday'] },
                opens: '09:00',
                closes: '13:00',
              },
              ...source,
            }],
          },
          payments: {
            assistance: [{ id: 'snap-ebt', value: { code: 'snap_ebt' }, ...source }],
          },
          access: {
            parking: { availability: { value: 'yes', ...source } },
          },
          products: {
            categories: [{ id: 'fresh-produce', value: { code: 'fresh_produce' }, ...source }],
          },
        },
        sources: [{
          id: 'official-market-page',
          url: 'https://example.com/market',
          title: 'Test Market visitor information',
          fields: ['first_party.operations'],
          kind: 'first_party',
          scope: 'market',
          accessed_at: '2026-08-21',
        }],
      },
      undefined,
    );

    expect(merged.first_party?.operations?.timezone?.value).toBe('America/Los_Angeles');
    expect(merged.operations?.days).toEqual(['Saturday 09:00-13:00']);
    expect(merged.operations?.season).toBe('June 3-September 30, 2026');
    expect(merged.payment?.food_assistance?.snap).toBe(true);
    expect(merged.amenities?.parking).toBe(true);
    expect(merged.products?.categories?.fresh_produce).toBe(true);
  });
});
