/**
 * Shape and rules for `data/city-guides.json`, the hand-researched visitor
 * guides that sit on top of the generated city pages.
 *
 * Kept free of Next.js imports so `npm run test:city-guides` can validate the
 * file with plain `node --test`. The guide is optional per city: a page with
 * no entry renders exactly as before, and nothing here invents a fact. Every
 * tip and FAQ answer names the source it came from, and the page links it.
 * FAQs must add something the tip cards do not already say (see
 * `faqRepeatsTips`); the page hides any that do not.
 */

export const GUIDE_TITLE_MAX_LENGTH = 60;
export const GUIDE_DESCRIPTION_MAX_LENGTH = 160;
/** Enough to plan a visit without turning the page into an essay. */
export const GUIDE_MAX_TIPS = 6;
export const GUIDE_MAX_FAQS = 4;
export const GUIDE_TIP_MAX_LENGTH = 200;
export const GUIDE_LABEL_MAX_LENGTH = 24;
export const GUIDE_ANSWER_MAX_LENGTH = 320;

/** Stand-in for the city's live market count in a title or description. */
export const COUNT_TOKEN = '{count}';

export interface CityGuideSource {
  id: string;
  title: string;
  url: string;
}

export interface CityGuideTip {
  label: string;
  text: string;
  source_ids: string[];
}

export interface CityGuideFaq {
  question: string;
  answer: string;
  source_ids: string[];
}

export interface CityGuide {
  /** The day the sources were actually read, YYYY-MM-DD. */
  verified_at: string;
  /** Optional title override; may contain `{count}`. */
  title?: string;
  /** Optional meta description override; may contain `{count}`. */
  description?: string;
  tips: CityGuideTip[];
  faqs: CityGuideFaq[];
  sources: CityGuideSource[];
}

export interface CityGuideFile {
  schema_version: 1;
  note?: string;
  guides: Record<string, CityGuide>;
}

/** Dashes the site copy never uses (see `clean()` in geo.ts). */
const BANNED_DASHES = /[–—]/;

/** Fill `{count}` with the city's current market count. */
export function fillCount(template: string, count: number): string {
  return template.split(COUNT_TOKEN).join(String(count));
}

/** Words too common in a guide to say anything about whether two facts match. */
const FILLER_WORDS = new Set(
  'the and are for from with that this there their its yes not you your can has have was were will all any but also into onto than then they them each every just only more most some such very open runs farmers farmer market markets'.split(
    ' '
  )
);

function factTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !FILLER_WORDS.has(token))
  );
}

/** Share of an answer's words that already appear in the tips, at or above which it repeats them. */
export const FAQ_REPEAT_THRESHOLD = 0.6;

/**
 * True when an FAQ answer mostly restates the guide's tip cards (the same
 * days, times, places and numbers). The page shows the cards right above the
 * FAQ, so a repeat is only extra reading; a guide FAQ has to add a fact.
 */
export function faqRepeatsTips(
  faq: Pick<CityGuideFaq, 'answer'>,
  tips: Pick<CityGuideTip, 'text'>[]
): boolean {
  const answer = factTokens(faq.answer);
  if (answer.size === 0 || tips.length === 0) return false;
  const shown = factTokens(tips.map((tip) => tip.text).join(' '));
  let repeated = 0;
  for (const token of answer) if (shown.has(token)) repeated += 1;
  return repeated / answer.size >= FAQ_REPEAT_THRESHOLD;
}

/**
 * Every problem in the file, as readable strings. Empty means valid.
 * `knownCities` is the set of "{state}/{city}" keys from the geo index;
 * `marketCounts` lets the title check use the real filled-in length.
 */
export function validateCityGuides(
  file: CityGuideFile,
  knownCities?: Map<string, number>
): string[] {
  const problems: string[] = [];
  if (file.schema_version !== 1) problems.push('schema_version must be 1');

  for (const [key, guide] of Object.entries(file.guides ?? {})) {
    const at = (message: string) => problems.push(`${key}: ${message}`);

    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) at('key must be "{state-slug}/{city-slug}"');
    const count = knownCities?.get(key);
    if (knownCities && count === undefined) at('no such city in public/data/geo_index.json');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(guide.verified_at ?? '')) at('verified_at must be YYYY-MM-DD');

    const sourceIds = new Set<string>();
    for (const source of guide.sources ?? []) {
      if (!source.id || sourceIds.has(source.id)) at(`duplicate or empty source id "${source.id}"`);
      sourceIds.add(source.id);
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(source.url ?? '')) at(`source ${source.id} needs a full URL`);
      if (!source.title?.trim()) at(`source ${source.id} needs a title`);
    }

    const cites = (ids: string[] | undefined, what: string) => {
      if (!ids || ids.length === 0) at(`${what} cites no source`);
      for (const id of ids ?? []) if (!sourceIds.has(id)) at(`${what} cites unknown source "${id}"`);
    };
    const copy = (text: string | undefined, what: string, max: number) => {
      if (!text?.trim()) return at(`${what} is empty`);
      if (text.length > max) at(`${what} is ${text.length} chars (max ${max})`);
      if (BANNED_DASHES.test(text)) at(`${what} contains an en or em dash`);
    };

    if (!Array.isArray(guide.tips)) at('tips must be an array');
    if ((guide.tips ?? []).length > GUIDE_MAX_TIPS) at(`more than ${GUIDE_MAX_TIPS} tips`);
    for (const [index, tip] of (guide.tips ?? []).entries()) {
      copy(tip.label, `tip ${index + 1} label`, GUIDE_LABEL_MAX_LENGTH);
      copy(tip.text, `tip ${index + 1}`, GUIDE_TIP_MAX_LENGTH);
      cites(tip.source_ids, `tip ${index + 1}`);
    }

    if (!Array.isArray(guide.faqs)) at('faqs must be an array');
    if ((guide.faqs ?? []).length > GUIDE_MAX_FAQS) at(`more than ${GUIDE_MAX_FAQS} faqs`);
    for (const [index, faq] of (guide.faqs ?? []).entries()) {
      copy(faq.question, `faq ${index + 1} question`, 120);
      copy(faq.answer, `faq ${index + 1} answer`, GUIDE_ANSWER_MAX_LENGTH);
      cites(faq.source_ids, `faq ${index + 1}`);
      if (faq.answer && faqRepeatsTips(faq, guide.tips ?? [])) {
        at(`faq ${index + 1} repeats the tips; an FAQ must add a fact the cards do not show`);
      }
    }

    const filled = (text: string) => fillCount(text, count ?? 999);
    if (guide.title !== undefined) {
      copy(filled(guide.title), 'title', GUIDE_TITLE_MAX_LENGTH);
    }
    if (guide.description !== undefined) {
      copy(filled(guide.description), 'description', GUIDE_DESCRIPTION_MAX_LENGTH);
    }
  }

  return problems;
}
