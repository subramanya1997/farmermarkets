import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { validateCityGuides, fillCount, faqRepeatsTips } = await import('./cityGuideSchema.ts');

const guides = JSON.parse(readFileSync('data/city-guides.json', 'utf8'));
const geoIndex = JSON.parse(readFileSync('public/data/geo_index.json', 'utf8')) as {
  states: { slug: string; cities: { slug: string; market_slugs: string[] }[] }[];
};

const knownCities = new Map<string, number>();
for (const state of geoIndex.states) {
  for (const city of state.cities ?? []) {
    knownCities.set(`${state.slug}/${city.slug}`, city.market_slugs.length);
  }
}

test('every city guide is valid, sourced and points at a real city', () => {
  assert.deepEqual(validateCityGuides(guides, knownCities), []);
});

test('the validator catches the mistakes a guide edit is likely to make', () => {
  const broken = {
    schema_version: 1,
    guides: {
      'tennessee/nashville': {
        verified_at: 'Oct 21',
        title: 'Nashville Farmers Markets — {count} Markets, Days, Hours and Parking Info',
        tips: [{ label: 'Parking', text: 'Free on site.', source_ids: ['missing'] }],
        faqs: [{ question: 'Is it open?', answer: 'Yes.', source_ids: [] }],
        sources: [{ id: 'a', title: 'A', url: 'not a url' }],
      },
      'nowhere/atlantis': { verified_at: '2026-10-21', tips: [], faqs: [], sources: [] },
    },
  };
  const problems = validateCityGuides(broken as never, knownCities).join('\n');
  assert.match(problems, /verified_at/);
  assert.match(problems, /en or em dash/);
  assert.match(problems, /title is \d+ chars/);
  assert.match(problems, /unknown source "missing"/);
  assert.match(problems, /faq 1 cites no source/);
  assert.match(problems, /needs a full URL/);
  assert.match(problems, /nowhere\/atlantis: no such city/);
});

test('fillCount replaces every count token', () => {
  assert.equal(fillCount('{count} markets, {count} total', 7), '7 markets, 7 total');
});

test('an FAQ that restates a tip card is flagged; one with a new fact is not', () => {
  const tips = [
    {
      text: "Nashville Farmers' Market has free 2-hour parking on site and along 7th Ave. State government lots nearby are free on Saturdays and Sundays.",
    },
  ];
  assert.equal(
    faqRepeatsTips(
      {
        answer:
          'Yes. Customers get free 2-hour parking on site and along 7th Ave, and nearby state government lots are free on weekends.',
      },
      tips
    ),
    true
  );
  assert.equal(
    faqRepeatsTips({ answer: 'Dogs on a leash are welcome everywhere except inside the Market House.' }, tips),
    false
  );
  assert.equal(faqRepeatsTips({ answer: 'Anything at all.' }, []), false);

  const repeated = {
    schema_version: 1,
    guides: {
      'tennessee/nashville': {
        verified_at: '2026-10-21',
        tips: [{ label: 'Parking', text: tips[0].text, source_ids: ['a'] }],
        faqs: [
          {
            question: 'Is parking free?',
            answer: 'Yes. Free 2-hour parking on site and along 7th Ave, and state government lots nearby are free on Saturdays and Sundays.',
            source_ids: ['a'],
          },
        ],
        sources: [{ id: 'a', title: 'A', url: 'https://example.com/a' }],
      },
    },
  };
  assert.match(validateCityGuides(repeated as never, knownCities).join('\n'), /faq 1 repeats the tips/);
});
