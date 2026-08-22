import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasConflictingUnqualifiedSeasonalHours,
  isCanonicalSocialProfileUrl,
  isGenericSingaporeNeaWebsite,
  isKnownContaminatedPromotion,
  isNonMarketSchedule,
  isPastDatedSchedule,
} from './enrichment-audit-quality.mjs';

test('requires season context when the same market day has different hours', () => {
  assert.equal(hasConflictingUnqualifiedSeasonalHours([
    'Saturdays from 8AM to 1PM',
    'Saturdays from 9AM to 1PM',
  ]), true);
  assert.equal(hasConflictingUnqualifiedSeasonalHours([
    'Saturdays, May through October, 8AM to 1PM',
    'Saturdays, November through April, 9AM to 1PM',
  ]), false);
});

test('rejects stale and non-market event schedules', () => {
  assert.equal(isPastDatedSchedule('Saturday, July 23, 2016 at 9:00 AM – 2:00 PM', '2026-08-21'), true);
  assert.equal(isPastDatedSchedule('Saturdays, May through October 2026, 8AM to 1PM', '2026-08-21'), false);
  assert.equal(isNonMarketSchedule('OneBlood Bus visit Sunday from 9 AM to 2 PM'), true);
  assert.equal(isNonMarketSchedule('Sundays from 9 AM to 2 PM'), false);
});

test('accepts only canonical social profiles', () => {
  assert.equal(isCanonicalSocialProfileUrl('https://www.instagram.com/centralmarketlancaster/'), true);
  assert.equal(isCanonicalSocialProfileUrl('https://www.linkedin.com/company/freshfarm'), true);
  assert.equal(isCanonicalSocialProfileUrl('https://www.tiktok.com/@centralmarketlancaster?_t=tracking'), false);
  assert.equal(isCanonicalSocialProfileUrl('https://www.facebook.com/market/photos'), false);
  assert.equal(isCanonicalSocialProfileUrl('https://www.instagram.com/explore/locations/123/market/'), false);
  assert.equal(isCanonicalSocialProfileUrl('https://www.youtube.com/playlist?list=abc'), false);
});

test('rejects a generic NEA overview as a venue website', () => {
  assert.equal(isGenericSingaporeNeaWebsite('https://www.nea.gov.sg/our-services/hawker-management/overview'), true);
  assert.equal(isGenericSingaporeNeaWebsite('https://www.nea.gov.sg/our-services/hawker-management/overview#onemap'), true);
  assert.equal(isGenericSingaporeNeaWebsite('https://www.nea.gov.sg/our-services/hawker-management/individual-stall'), false);
});

test('keeps confirmed municipality footer contacts from returning', () => {
  assert.equal(isKnownContaminatedPromotion('313062', 'contact.social_media', 'https://www.facebook.com/Chilhowie/'), true);
  assert.equal(isKnownContaminatedPromotion('313252', 'contact.phone_numbers', '(434) 476-2343'), true);
  assert.equal(isKnownContaminatedPromotion('313252', 'contact.websites', 'https://www.townofhalifax.com/index.php?option=com_content&view=article&id=125&Itemid=337'), true);
  assert.equal(isKnownContaminatedPromotion('313252', 'contact.social_media', 'https://www.facebook.com/halifaxmarketplace/'), false);
});
