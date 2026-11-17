import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationDecider,
  applicationVisibleToOrganizer,
  attendanceLabel,
  canReadDocument,
  checklistProgress,
  confirmedByMarket,
  marketSlugFrom,
  mergeVendorRoster,
  normalizeVendorName,
  resolveMarketId,
  toCsv,
  vendorPagePublic,
  vendorPubliclyListed,
} from './vendorRules.ts';
import {
  applicationDetailsSchema,
  checklistItemId,
  checklistSchema,
  parseVendorProfile,
  readChecklist,
  readDays,
  readVendorDraft,
  uniqueVendorSlug,
  vendorFieldsThatDiffer,
  vendorSlugBase,
  type ChecklistItem,
  type VendorProfile,
} from './vendorProfile.ts';

const profile: VendorProfile = {
  name: 'Green & Gold Farm',
  products: ['fresh_produce', 'eggs'],
  items: ['heirloom tomatoes'],
  description: 'Four acres of vegetables.',
  website: 'https://greengold.example.com',
  social_profiles: [{ platform: 'instagram', url: 'https://instagram.com/greengold' }],
  phone: '707 555 0100',
  email: 'hello@greengold.example.com',
  photos: [],
};

test('a valid profile parses and trims', () => {
  const parsed = parseVendorProfile({ ...profile, name: '  Green & Gold Farm  ', website: '' });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.profile.name, 'Green & Gold Farm');
    assert.equal(parsed.profile.website, undefined);
  }
});

test('a profile rejects script links, unknown fields and too many photos', () => {
  const scriptLink = parseVendorProfile({ ...profile, website: 'javascript:alert(1)' });
  assert.equal(scriptLink.ok, false);
  const extra = parseVendorProfile({ ...profile, admin: true });
  assert.equal(extra.ok, false);
  const photo = { url: 'https://x.public.blob.vercel-storage.com/vendors/a/1.jpg', pathname: 'vendors/a/1.jpg' };
  const many = parseVendorProfile({ ...profile, photos: Array.from({ length: 8 }, () => photo) });
  assert.equal(many.ok, false);
  const short = parseVendorProfile({ ...profile, name: 'A' });
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.errors[0].path, 'name');
});

test('a half-filled draft reopens with whatever still parses', () => {
  const draft = readVendorDraft({ name: 'Bread Shed', products: ['baked_goods'], website: 'not a link', photos: 'nope' });
  assert.equal(draft.name, 'Bread Shed');
  assert.deepEqual(draft.products, ['baked_goods']);
  assert.equal(draft.website, undefined);
  assert.deepEqual(draft.photos, []);
  assert.deepEqual(readVendorDraft(null).items, []);
});

test('the admin diff names only the fields that changed', () => {
  assert.deepEqual(vendorFieldsThatDiffer(profile, { ...profile, description: 'Five acres.' }), ['description']);
  assert.deepEqual(vendorFieldsThatDiffer(profile, profile), []);
  assert.ok(vendorFieldsThatDiffer(null, profile).includes('name'));
});

test('vendor slugs are plain words with single hyphens', () => {
  assert.equal(vendorSlugBase('Green & Gold Farm'), 'green-and-gold-farm');
  assert.equal(vendorSlugBase("Rosie's Crêpes — Santa Rosa"), 'rosies-crepes-santa-rosa');
  assert.equal(vendorSlugBase('!!!'), 'vendor');
  assert.equal(uniqueVendorSlug('bread-shed', []), 'bread-shed');
  assert.equal(uniqueVendorSlug('bread-shed', ['bread-shed', 'bread-shed-2']), 'bread-shed-3');
});

test('application details keep weekday order and drop unknown days', () => {
  const parsed = applicationDetailsSchema.safeParse({ days: ['sunday', 'saturday'], stall_note: '  Row B,   near the fountain ', message: '' });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.stall_note, 'Row B, near the fountain');
  assert.deepEqual(readDays(['sunday', 'funday', 'saturday']), ['saturday', 'sunday']);
  assert.deepEqual(readDays('saturday'), []);
});

test('checklists reject duplicate ids and survive bad stored data', () => {
  const item = { id: 'liability-insurance', label: 'Liability insurance', required: true };
  assert.equal(checklistSchema.safeParse({ items: [item, item], settings: {} }).success, false);
  assert.equal(checklistSchema.safeParse({ items: [item], settings: { accepting: false } }).success, true);
  const empty = readChecklist('junk', null);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.settings.accepting, true);
  assert.equal(empty.settings.intro, undefined);
  assert.equal(checklistItemId('Liability insurance', ['liability-insurance']), 'liability-insurance-2');
  assert.equal(checklistItemId('W-9 form', []), 'w-9-form');
});

test('who decides and when a vendor is public', () => {
  assert.equal(applicationDecider(true), 'organizer');
  assert.equal(applicationDecider(false), 'admin');
  const live = { hasLiveProfile: true, suspended: false };
  assert.equal(vendorPubliclyListed(live, 'approved'), true);
  assert.equal(vendorPubliclyListed(live, 'pending'), false);
  assert.equal(vendorPubliclyListed({ hasLiveProfile: false, suspended: false }, 'approved'), false);
  assert.equal(vendorPubliclyListed({ hasLiveProfile: true, suspended: true }, 'approved'), false);
  assert.equal(vendorPagePublic(live), true);
  assert.equal(vendorPagePublic({ hasLiveProfile: true, suspended: true }), false);
  assert.equal(applicationVisibleToOrganizer({ hasLiveProfile: false, suspended: false }, 'pending'), false);
  assert.equal(applicationVisibleToOrganizer(live, 'pending'), true);
  assert.equal(applicationVisibleToOrganizer(live, 'withdrawn'), false);
  assert.equal(confirmedByMarket({ status: 'approved', decidedRole: 'organizer' }), true);
  assert.equal(confirmedByMarket({ status: 'approved', decidedRole: 'admin' }), false);
  assert.equal(confirmedByMarket({ status: 'pending', decidedRole: 'organizer' }), false);
});

test('documents open only for the vendor, the admin and organizers they were sent to', () => {
  const document = { vendorId: 'v1', attachedMarketIds: ['m1'] };
  assert.equal(canReadDocument({ isAdmin: true, vendorId: null, managedMarketIds: [] }, document), true);
  assert.equal(canReadDocument({ isAdmin: false, vendorId: 'v1', managedMarketIds: [] }, document), true);
  assert.equal(canReadDocument({ isAdmin: false, vendorId: 'v2', managedMarketIds: [] }, document), false);
  assert.equal(canReadDocument({ isAdmin: false, vendorId: null, managedMarketIds: ['m1'] }, document), true);
  assert.equal(canReadDocument({ isAdmin: false, vendorId: null, managedMarketIds: ['m2'] }, document), false);
  assert.equal(canReadDocument({ isAdmin: false, vendorId: null, managedMarketIds: ['m1'] }, { vendorId: 'v1', attachedMarketIds: [] }), false);
});

test('checklist progress ignores archived items and withdrawn documents', () => {
  const items: ChecklistItem[] = [
    { id: 'insurance', label: 'Liability insurance', required: true },
    { id: 'permit', label: "Seller's permit", required: true },
    { id: 'organic', label: 'Organic certificate', required: false },
    { id: 'old', label: 'Old form', required: true, archived: true },
  ];
  const none = checklistProgress(items, []);
  assert.deepEqual(none.missingRequired.map((item) => item.id), ['insurance', 'permit']);
  assert.equal(none.readyToSend, false);
  assert.equal(none.active.length, 3);

  const sent = checklistProgress(items, [
    { requirementKey: 'insurance', status: 'approved' },
    { requirementKey: 'permit', status: 'pending' },
  ]);
  assert.equal(sent.readyToSend, true);
  assert.equal(sent.complete, false);
  assert.deepEqual(sent.waiting.map((item) => item.id), ['permit']);

  const turnedDown = checklistProgress(items, [
    { requirementKey: 'insurance', status: 'approved' },
    { requirementKey: 'permit', status: 'rejected' },
  ]);
  assert.equal(turnedDown.readyToSend, false);

  const withdrawn = checklistProgress(items, [
    { requirementKey: 'insurance', status: 'approved' },
    { requirementKey: 'permit', status: 'approved', withdrawn: true },
  ]);
  assert.deepEqual(withdrawn.missingRequired.map((item) => item.id), ['permit']);

  const done = checklistProgress(items, [
    { requirementKey: 'insurance', status: 'approved' },
    { requirementKey: 'permit', status: 'approved' },
  ]);
  assert.equal(done.complete, true);
  assert.equal(checklistProgress([], []).readyToSend, true);
});

test('vendor names match across case, punctuation and plurals', () => {
  assert.equal(normalizeVendorName('The Green & Gold Farms, LLC'), normalizeVendorName('green and gold farm'));
  assert.notEqual(normalizeVendorName('Green Farm'), normalizeVendorName('Gold Farm'));
  assert.equal(normalizeVendorName("Rosie's Crêpes"), 'rosie crepe');
});

test('account vendors come first and hide a typed entry with the same name', () => {
  const accounts = [{ name: 'Green & Gold Farm' }, { name: 'Bread Shed' }, { name: 'green and gold farms' }];
  const roster = [{ value: { name: 'Green and Gold Farms' } }, { value: { name: 'Honey Hut' } }];
  const merged = mergeVendorRoster(accounts, roster, (item) => item.value.name);
  assert.deepEqual(merged.accounts.map((vendor) => vendor.name), ['Green & Gold Farm', 'Bread Shed']);
  assert.deepEqual(merged.roster.map((item) => item.value.name), ['Honey Hut']);
});

test('merged market ids and old slugs resolve to the survivor', () => {
  const merges = [{ id: 'a', into: 'b' }, { id: 'b', into: 'c' }];
  assert.equal(resolveMarketId('a', merges), 'c');
  assert.equal(resolveMarketId('z', merges), 'z');
  const redirects = { 'old-market': '/markets/new-market' };
  assert.equal(marketSlugFrom('https://www.farmermarkets.app/markets/Old-Market/apply', redirects), 'new-market');
  assert.equal(marketSlugFrom('/markets/some-market/claim', redirects), 'some-market');
  assert.equal(marketSlugFrom('some-market', redirects), 'some-market');
  assert.equal(marketSlugFrom('not a slug!', redirects), null);
});

test('csv quotes commas and defuses formulas', () => {
  const csv = toCsv([
    ['Name', 'Email'],
    ['Smith, Jane', '=HYPERLINK("http://evil")'],
    ['Line\nbreak', null],
  ]);
  assert.equal(csv, 'Name,Email\r\n"Smith, Jane","\'=HYPERLINK(""http://evil"")"\r\n"Line\nbreak",\r\n');
});

test('attendance reads like a sentence', () => {
  assert.equal(attendanceLabel(['sunday', 'saturday']), 'Saturdays and Sundays');
  assert.equal(attendanceLabel(['wednesday']), 'Wednesdays');
  assert.equal(attendanceLabel(['wednesday', 'saturday', 'sunday']), 'Wednesdays, Saturdays and Sundays');
  assert.equal(attendanceLabel([]), '');
});
