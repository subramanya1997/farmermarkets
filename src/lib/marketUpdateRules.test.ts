import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OPEN_UPDATES,
  MAX_UPDATE_DAYS,
  MAX_UPDATE_LENGTH,
  canPostMarketUpdates,
  cleanUpdateBody,
  currentMarketUpdates,
  isOpenUpdate,
  marketUpdateState,
  parseMarketUpdate,
} from './marketUpdateRules.ts';
import { applicationDecision } from './vendorRules.ts';

const now = new Date('2026-11-19T15:00:00Z');
const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000);
const days = (n: number) => hours(n * 24);

test('only a confirmed manager or an admin with a verified email can post updates', () => {
  assert.equal(canPostMarketUpdates({ emailVerified: true, isAdmin: false, managesMarket: true }), true);
  assert.equal(canPostMarketUpdates({ emailVerified: true, isAdmin: true, managesMarket: false }), true);
  // A pending claim edits the listing (canEditMarket) but is not a manager yet.
  assert.equal(canPostMarketUpdates({ emailVerified: true, isAdmin: false, managesMarket: false }), false);
  assert.equal(canPostMarketUpdates({ emailVerified: false, isAdmin: false, managesMarket: true }), false);
  assert.equal(canPostMarketUpdates({ emailVerified: false, isAdmin: true, managesMarket: true }), false);
});

test('an update is scheduled, live, ended or withdrawn', () => {
  const at = (startsAt: Date, endsAt: Date, withdrawnAt: Date | null = null) => ({ startsAt, endsAt, withdrawnAt });
  assert.equal(marketUpdateState(at(hours(-1), hours(1)), now), 'live');
  assert.equal(marketUpdateState(at(hours(1), hours(5)), now), 'scheduled');
  assert.equal(marketUpdateState(at(hours(-5), hours(-1)), now), 'ended');
  // The end is exclusive: at the stroke of `endsAt` it is gone.
  assert.equal(marketUpdateState(at(hours(-5), now), now), 'ended');
  assert.equal(marketUpdateState(at(hours(-1), hours(1), hours(-0.5)), now), 'withdrawn');
  assert.equal(isOpenUpdate(at(hours(1), hours(5)), now), true);
  assert.equal(isOpenUpdate(at(hours(-5), hours(-1)), now), false);
});

test('shoppers see live updates only: expired, withdrawn and scheduled ones are hidden', () => {
  const updates = [
    { id: 'live-old', startsAt: days(-3), endsAt: days(2), withdrawnAt: null },
    { id: 'live-new', startsAt: hours(-2), endsAt: days(1), withdrawnAt: null },
    { id: 'expired', startsAt: days(-5), endsAt: hours(-1), withdrawnAt: null },
    { id: 'withdrawn', startsAt: days(-1), endsAt: days(3), withdrawnAt: hours(-1) },
    { id: 'scheduled', startsAt: days(2), endsAt: days(3), withdrawnAt: null },
  ];
  assert.deepEqual(
    currentMarketUpdates(updates, now).map((update) => update.id),
    ['live-new', 'live-old'],
  );
  // The same list a day later: the newer one expired on its own, the scheduled one is not up yet.
  assert.deepEqual(
    currentMarketUpdates(updates, days(1)).map((update) => update.id),
    ['live-old'],
  );
  assert.deepEqual(
    currentMarketUpdates(updates, hours(24 * 2 + 1)).map((update) => update.id),
    ['scheduled'],
  );
});

test('at most MAX_OPEN_UPDATES show at once', () => {
  const many = Array.from({ length: MAX_OPEN_UPDATES + 2 }, (_, index) => ({
    id: String(index),
    startsAt: hours(-index - 1),
    endsAt: days(1),
    withdrawnAt: null,
  }));
  assert.equal(currentMarketUpdates(many, now).length, MAX_OPEN_UPDATES);
});

test('a valid update parses, with the text tidied', () => {
  const parsed = parseMarketUpdate(
    { body: '  Closed   Saturday\r\n\r\n\r\nfor the parade.\u0007 ', startsAt: hours(-1).toISOString(), endsAt: days(2).toISOString() },
    now,
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.body, 'Closed Saturday\n\nfor the parade.');
  assert.equal(parsed.data.endsAt.getTime(), days(2).getTime());
});

test('markup stays plain text: nothing is stripped or turned into HTML', () => {
  const body = '<b>Closed</b> <script>alert(1)</script> & back next week';
  assert.equal(cleanUpdateBody(body), body);
  const parsed = parseMarketUpdate({ body, startsAt: now.toISOString(), endsAt: days(1).toISOString() }, now);
  assert.equal(parsed.ok && parsed.data.body, body);
});

test('bad updates are refused with a reason', () => {
  const at = (body: string, startsAt: Date, endsAt: Date) => parseMarketUpdate({ body, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, now);
  assert.equal(at('  ', now, days(1)).ok, false);
  assert.equal(at('x'.repeat(MAX_UPDATE_LENGTH + 1), now, days(1)).ok, false);
  assert.equal(at('x'.repeat(MAX_UPDATE_LENGTH), now, days(1)).ok, true);
  assert.equal(at('Closed today', days(1), now).ok, false, 'end before start');
  assert.equal(at('Closed today', days(-3), days(-1)).ok, false, 'already over');
  assert.equal(at('Closed today', now, days(MAX_UPDATE_DAYS + 1)).ok, false, 'too long');
  assert.equal(at('Closed today', days(400), days(401)).ok, false, 'too far ahead');
  assert.equal(parseMarketUpdate({ body: 'Closed today', startsAt: 'soon', endsAt: days(1).toISOString() }, now).ok, false);
  assert.equal(parseMarketUpdate(null, now).ok, false);
});

test('vendor decisions: approve, deny and remove from the market', () => {
  assert.deepEqual(applicationDecision(true, 'pending'), { to: 'approved', removing: false });
  assert.deepEqual(applicationDecision(false, 'pending'), { to: 'denied', removing: false });
  // Removing an approved vendor denies the application; the vendor account is untouched.
  assert.deepEqual(applicationDecision(false, 'approved'), { to: 'denied', removing: true });
  assert.equal(applicationDecision(true, 'approved'), null);
  assert.equal(applicationDecision(true, 'denied'), null);
  assert.equal(applicationDecision(false, 'denied'), null);
  assert.equal(applicationDecision(false, 'withdrawn'), null);
});
