// Bounded, date-aware research. An empty result is preferable to guessing.
const text = description => ({ type: 'string', description });
const evidence = {
  source_url: text('Exact primary official page URL publishing THIS item for THIS market. Use the input official host. Never a generic all-markets roster, directory, social post, or another locality.'),
  evidence_excerpt: text('Verbatim source excerpt containing the item name, market assignment, and explicit date/year or roster period. Include this same excerpt in API basis citations. Never paraphrase or infer the year.'),
};
const item = (properties, required) => ({ type: 'object', additionalProperties: false, properties: { ...properties, ...evidence }, required: [...required, ...Object.keys(evidence)] });
export const RICH_TASK_SPEC = {
  input_schema: { type: 'json', json_schema: { type: 'object', properties: {
    market_name: text('Exact market to research; do not combine sibling markets operated by the same organization.'),
    address: text('Known market street address; require matching locality if address changed.'),
    city: text('Exact locality'), state: text('State/province'), country: text('Country'),
    official_website: text('Start here. Only this authoritative host may provide accepted facts; follow market-specific pages.'),
    research_date: text('As-of date. Only events on/after this date with a published explicit year. Only current roster periods covering this date; reject expired summer lists. Current official market-specific vendor directory links are useful even without a named roster.'),
  }, required: ['market_name','city','state','country','official_website','research_date'] } },
  output_schema: { type: 'json', json_schema: { type: 'object', additionalProperties: false, properties: {
    identity_match: { type: 'string', enum: ['exact_market','could_not_verify'], description: 'Only exact market identity AND locality supported by published official excerpts. Matching street name or generic operator is insufficient. Could_not_verify if wrong town, shared roster, stale evidence, or ambiguous name.' },
    identity_evidence: text('Verbatim official excerpt identifying the exact market name and city/locality (plus state/province or address when published). Cite the input official host.'),
    events: { type:'array', description:'Up to 6 future/current one-off events explicitly assigned to this market, exact published YEAR required. Not regular weekly dates, expired events, or unrelated operator events. Empty when unsupported.', items:item({
      name:text('Exact published event name'), kind:{type:'string',enum:['music','workshop','kids','festival','special_market','other']},
      start_date:text('YYYY-MM-DD; explicit published year required, on/after research date'), end_date:text('YYYY-MM-DD if explicitly published; otherwise empty'),
      published_hours:text('Exact published local hours text, otherwise empty; never infer timezone'), venue:text('Exact published venue for this event, otherwise empty'),
    },['name','kind','start_date','end_date','published_hours','venue']) },
    vendor_directory: { type:'array',description:'One current official MARKET-SPECIFIC seller/weekly roster link. Generic multi-market seller directory is not enough. Empty when unsupported.',items:item({url:text('Exact market-specific official directory/roster URL on input host'),kind:{type:'string',enum:['directory','weekly_roster']}},['url','kind'])},
    vendor_roster: { type:'array',description:'Up to 12 named vendors explicitly assigned to THIS market in a dated currently applicable official roster. Non-exhaustive. No attendance claim; reject lists whose season ended before research_date, undated rosters, generic all-market vendors, sponsors, applicants, and operator employees.',items:item({
      name:text('Exact published vendor name'), period:text('Exact published current roster period, including year'), start_date:text('YYYY-MM-DD when explicitly published, otherwise empty'), end_date:text('YYYY-MM-DD when explicitly published, otherwise empty'),
    },['name','period','start_date','end_date'])},
    programs:{type:'array',description:'Current market-specific named recurring visitor programs with official explicit current-year evidence. No guesses from generic benefit policies or prior-year announcements.',items:item({name:text('Exact named program'),kind:{type:'string',enum:['nutrition','kids_club','food_access','composting','community','education','other']},year:text('Explicit current published year, e.g. 2026'),description:text('One short verbatim published description')},['name','kind','year','description'])},
  }, required:['identity_match','identity_evidence','events','vendor_directory','vendor_roster','programs'] } },
};
