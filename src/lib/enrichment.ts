export interface MarketEnrichmentSource {
  /** Stable within a v2 record; required when a rich fact references it. */
  id?: string;
  url: string;
  title: string;
  fields: string[];
  kind?: 'first_party' | 'official_catalog' | 'google_maps';
  /** Operator-scoped sources cannot support market-specific hours or contacts. */
  scope?: 'market' | 'operator';
  accessed_at?: string;
}

export type MarketWeekday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface SourcedValue<T> {
  value: T;
  source_ids: string[];
  verified_at: string;
}

export interface SourcedItem<T> extends SourcedValue<T> {
  /** Stable kebab-case identifier within its collection. */
  id: string;
}

export type MarketRecurrence =
  | { kind: 'weekly'; weekdays: MarketWeekday[]; interval_weeks?: 1 | 2 }
  | {
      kind: 'monthly';
      weekdays: MarketWeekday[];
      week_numbers: (1 | 2 | 3 | 4 | 5 | -1)[];
    }
  | { kind: 'dates'; dates: string[] };

export type StructuredMarketSeason =
  | { kind: 'year_round' }
  | {
      kind: 'annual_range';
      start: { month: number; day?: number };
      end: { month: number; day?: number };
    }
  | { kind: 'dated_range'; start_date: string; end_date: string };

export interface StructuredMarketSchedule {
  label?: string;
  recurrence: MarketRecurrence;
  /** Local 24-hour HH:mm. */
  opens: string;
  /** Local 24-hour HH:mm. */
  closes: string;
  start_date?: string;
  end_date?: string;
  location_note?: string;
}

export type MarketScheduleException =
  | {
      start_date: string;
      end_date?: string;
      status: 'closed';
      note?: string;
    }
  | {
      start_date: string;
      end_date?: string;
      status: 'modified_hours' | 'special_opening';
      opens: string;
      closes: string;
      note?: string;
    };

export interface MarketFirstPartyFacts {
  identity?: {
    canonical_name?: SourcedValue<string>;
    operator_name?: SourcedValue<string>;
    market_type?: SourcedValue<
      'farmers_market' | 'public_food_market' | 'hawker_centre' | 'farm_stand' | 'food_cooperative' | 'other'
    >;
    producer_only?: SourcedValue<boolean>;
    certification?: SourcedValue<string>;
    vendor_radius?: SourcedValue<string>;
  };
  operations?: {
    timezone?: SourcedValue<string>;
    status?: SourcedValue<{
      value: 'active' | 'seasonal_break' | 'temporarily_closed' | 'permanently_closed';
      effective_date?: string;
      note?: string;
    }>;
    season?: SourcedValue<StructuredMarketSeason>;
    schedules?: SourcedItem<StructuredMarketSchedule>[];
    exceptions?: SourcedItem<MarketScheduleException>[];
    weather_policy?: SourcedValue<string>;
    cancellation_policy?: SourcedValue<string>;
  };
  payments?: {
    methods?: SourcedItem<{
      code:
        | 'cash'
        | 'credit_card'
        | 'debit_card'
        | 'check'
        | 'mobile_wallet'
        | 'contactless'
        | 'market_token'
        | 'other';
      label?: string;
    }>[];
    assistance?: SourcedItem<{
      code: 'snap_ebt' | 'wic' | 'fmnp' | 'sfmnp' | 'p_ebt' | 'other';
      name?: string;
      redemption_instructions?: string;
    }>[];
    incentives?: SourcedItem<{
      name: string;
      kind: 'match' | 'bonus' | 'discount' | 'voucher';
      applies_to?: string[];
      input_amount?: number;
      benefit_amount?: number;
      maximum_amount?: number;
      currency?: string;
      eligibility?: string;
      note?: string;
      url?: string;
    }>[];
  };
  access?: {
    entrance_note?: SourcedValue<string>;
    transit?: SourcedItem<{
      mode: 'bus' | 'rail' | 'ferry' | 'bike' | 'walk' | 'shuttle';
      routes?: string[];
      stop_name?: string;
      note?: string;
      url?: string;
    }>[];
    parking?: {
      availability?: SourcedValue<'yes' | 'no' | 'limited'>;
      cost?: SourcedValue<'free' | 'paid' | 'mixed'>;
      accessible_spaces?: SourcedValue<'yes' | 'no' | 'limited'>;
      location_note?: SourcedValue<string>;
      url?: SourcedValue<string>;
    };
    accessibility_note?: SourcedValue<string>;
    drop_off_note?: SourcedValue<string>;
    bicycle_parking?: SourcedValue<'yes' | 'no' | 'limited'>;
    market_map_url?: SourcedValue<string>;
  };
  amenities?: SourcedItem<{
    code:
      | 'restrooms'
      | 'seating'
      | 'picnic_area'
      | 'shade'
      | 'drinking_water'
      | 'atm'
      | 'wifi'
      | 'live_music'
      | 'kids_activities'
      | 'information_booth'
      | 'purchase_holding';
    availability: 'yes' | 'no' | 'limited';
    note?: string;
  }>[];
  policies?: SourcedItem<{
    code: 'pets' | 'service_animals' | 'smoking' | 'bags' | 'weather';
    rule:
      | 'allowed'
      | 'not_allowed'
      | 'discouraged'
      | 'service_animals_only'
      | 'conditional'
      | 'rain_or_shine'
      | 'weather_dependent';
    note?: string;
  }>[];
  vendors?: {
    count?: SourcedValue<{ value: number; qualifier?: string; as_of?: string }>;
    directory_url?: SourcedValue<string>;
    weekly_roster_url?: SourcedValue<string>;
    attendance_is_dynamic?: SourcedValue<boolean>;
    roster?: SourcedItem<{
      name: string;
      categories?: string[];
      website?: string;
      social_url?: string;
      seasonal?: boolean;
    }>[];
  };
  products?: {
    categories?: SourcedItem<{
      code:
        | 'fresh_produce'
        | 'meat'
        | 'dairy'
        | 'eggs'
        | 'herbs'
        | 'crafts'
        | 'prepared_food'
        | 'baked_goods'
        | 'flowers'
        | 'honey'
        | 'preserves'
        | 'wine'
        | 'other';
      label?: string;
    }>[];
    items?: SourcedItem<string>[];
    production_methods?: SourcedItem<string>[];
    availability_note?: SourcedValue<string>;
  };
  events?: SourcedItem<{
    name: string;
    kind: 'music' | 'workshop' | 'kids' | 'festival' | 'special_market' | 'other';
    start?: string;
    end?: string;
    description?: string;
    url?: string;
  }>[];
  programs?: SourcedItem<{
    name: string;
    kind: 'nutrition' | 'kids_club' | 'food_access' | 'composting' | 'community' | 'education' | 'other';
    description?: string;
    eligibility?: string;
    url?: string;
  }>[];
  languages?: {
    spoken?: SourcedItem<{ tag: string; label?: string }>[];
    materials?: SourcedItem<{ tag: string; label?: string }>[];
  };
  contact?: {
    newsletter?: SourcedValue<{ signup_url: string; name?: string; frequency?: string }>;
    social_profiles?: SourcedItem<{
      platform: 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'x' | 'youtube' | 'other';
      url: string;
      /** Operator profiles are useful for updates but are not a market-specific account. */
      scope: 'market' | 'operator';
    }>[];
  };
  faq_facts?: SourcedItem<{
    topic:
      | 'arrival'
      | 'weather'
      | 'accessibility'
      | 'pets'
      | 'parking'
      | 'payments'
      | 'products'
      | 'updates';
    answer: string;
    expires_on?: string;
  }>[];
}

export interface MarketEnrichmentMetadata {
  verified_at: string;
  /** Whether the check covered the entire listing or only the cited fields. */
  verification_scope: 'partial';
  sources: MarketEnrichmentSource[];
}

export type MarketAuditStatus =
  | 'already_enriched'
  | 'verified_update'
  | 'official_source_reviewed'
  | 'checked_no_verified_update'
  | 'identity_ambiguous'
  | 'blocked';

export interface MarketAuditMetadata {
  checked_at: string;
  status: MarketAuditStatus;
}

export interface MarketEnrichmentRecord {
  id: string;
  market_name: string;
  verified_at: string;
  verification_scope?: 'partial';
  schema_version?: 2;
  first_party?: MarketFirstPartyFacts;
  google_maps_url?: string;
  suppress_map?: boolean;
  visitor_note?: string;
  contact?: {
    websites?: string[];
    social_media?: string[];
    phone_numbers?: string[];
    emails?: string[];
  };
  operations?: {
    days?: string[];
    season?: string;
  };
  payment?: {
    methods?: string[];
    food_assistance?: {
      wic?: boolean;
      sfmnp?: boolean;
      fmnp?: boolean;
      snap?: boolean;
    };
  };
  amenities?: {
    features?: string[];
    parking?: boolean;
    restrooms?: boolean;
    picnic_area?: boolean;
    wheelchair_accessible?: boolean;
    pet_friendly?: boolean;
  };
  sources: MarketEnrichmentSource[];
}

/* ------------------------------------------------------------------ *
 * Merge
 * ------------------------------------------------------------------ */

/**
 * The slice of a raw market record the merge touches. Structural on purpose:
 * `data.ts` passes its `RawMarketData`, and `scripts/check-topic-pages.mjs`
 * passes plain snapshot JSON — both must flow through the SAME merge so the
 * site and its independent count-checker can never disagree about what an
 * enriched record says.
 */
export interface MergeableMarket {
  google_maps_url?: string;
  suppress_map?: boolean;
  visitor_note?: string;
  contact?: {
    websites?: string[];
    social_media?: string[];
    phone_numbers?: string[];
    emails?: string[];
  };
  operations?: { days?: string[]; season?: string; vendor_count?: number };
  payment?: {
    methods?: string[];
    food_assistance?: { wic?: boolean; sfmnp?: boolean; fmnp?: boolean; snap?: boolean };
  };
  amenities?: { features?: string[] } & Record<string, unknown>;
  products?: {
    items?: string[];
    production_methods?: string[];
    categories?: Record<string, boolean | undefined>;
  };
  schema_version?: 2;
  first_party?: MarketFirstPartyFacts;
  enrichment?: MarketEnrichmentMetadata;
  audit?: MarketAuditMetadata;
}

function uniqueStrings(...lists: (string[] | undefined)[]): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of lists.flat()) {
    const text = value?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values;
}

function uniquePhoneNumbers(...lists: (string[] | undefined)[]): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const value of lists.flat()) {
    const text = value?.trim();
    if (!text) continue;
    const digits = text.replace(/\D/g, '');
    const key = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits || text;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
  }
  return values;
}

const WEEKDAY_LABELS: Record<MarketWeekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

type RichPaymentMethodCode =
  | 'cash'
  | 'credit_card'
  | 'debit_card'
  | 'check'
  | 'mobile_wallet'
  | 'contactless'
  | 'market_token'
  | 'other';

const PAYMENT_LABELS: Record<RichPaymentMethodCode, string> = {
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  check: 'Check',
  mobile_wallet: 'Mobile Wallet',
  contactless: 'Contactless Payment',
  market_token: 'Market Tokens',
  other: 'Other',
};

function formatStructuredSeason(season: StructuredMarketSeason): string {
  if (season.kind === 'year_round') return 'Year-round';
  if (season.kind === 'dated_range') {
    const formatDate = (value: string, includeYear: boolean) => {
      const [year, month, day] = value.split('-').map(Number);
      if (!year || !month || !day) return value;
      return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' as const } : {}),
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(year, month - 1, day)));
    };
    const sameYear = season.start_date.slice(0, 4) === season.end_date.slice(0, 4);
    return `${formatDate(season.start_date, !sameYear)}-${formatDate(season.end_date, true)}`;
  }
  const monthNames = [
    '', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const format = ({ month, day }: { month: number; day?: number }) =>
    `${monthNames[month] || month}${day ? ` ${day}` : ''}`;
  return `${format(season.start)} - ${format(season.end)}`;
}

function formatStructuredSchedule(schedule: StructuredMarketSchedule): string[] {
  const range = `${schedule.opens}-${schedule.closes}`;
  if (schedule.recurrence.kind === 'dates') {
    return schedule.recurrence.dates.map((date) => `${date} ${range}`);
  }
  const days = schedule.recurrence.weekdays.map((day) => WEEKDAY_LABELS[day]);
  const recurrence = schedule.recurrence.kind === 'monthly'
    ? `${schedule.recurrence.week_numbers.join('/')} ${days.join(', ')}`
    : schedule.recurrence.interval_weeks === 2
      ? `Every other ${days.join(', ')}`
      : days.join(', ');
  return [`${recurrence} ${range}`];
}

/**
 * Project only lossless or conservative positive v2 facts into the existing
 * flat fields. Rich facts remain available in `first_party`; this adapter
 * keeps the current filters, fact rows and JSON-LD useful during migration.
 */
function projectFirstPartyFacts(firstParty?: MarketFirstPartyFacts): Partial<MergeableMarket> {
  if (!firstParty) return {};

  const schedules = firstParty.operations?.schedules?.flatMap((item) =>
    formatStructuredSchedule(item.value)
  );
  const paymentMethods = firstParty.payments?.methods?.map(
    (item) => item.value.label?.trim() || PAYMENT_LABELS[item.value.code]
  );
  const assistance = new Set(firstParty.payments?.assistance?.map((item) => item.value.code));
  const positiveAmenities = firstParty.amenities?.filter(
    (item) => item.value.availability === 'yes'
  );
  const amenityCodes = new Set(positiveAmenities?.map((item) => item.value.code));
  const petPolicy = firstParty.policies?.find((item) => item.value.code === 'pets')?.value.rule;
  const categoryCodes = firstParty.products?.categories?.map((item) => item.value.code) ?? [];
  const categoryFlags = Object.fromEntries(
    categoryCodes.filter((code) => code !== 'preserves' && code !== 'other').map((code) => [
      code === 'prepared_food' ? 'prepared_food' : code,
      true,
    ])
  );
  if (categoryCodes.includes('preserves')) categoryFlags.jams = true;

  return {
    contact: {
      social_media: firstParty.contact?.social_profiles?.map((item) => item.value.url),
    },
    operations: {
      ...(schedules?.length ? { days: schedules } : {}),
      ...(firstParty.operations?.season
        ? { season: formatStructuredSeason(firstParty.operations.season.value) }
        : {}),
      ...(firstParty.vendors?.count ? { vendor_count: firstParty.vendors.count.value.value } : {}),
    },
    payment: {
      ...(paymentMethods?.length ? { methods: paymentMethods } : {}),
      food_assistance: {
        ...(assistance.has('snap_ebt') ? { snap: true } : {}),
        ...(assistance.has('wic') ? { wic: true } : {}),
        ...(assistance.has('fmnp') ? { fmnp: true } : {}),
        ...(assistance.has('sfmnp') ? { sfmnp: true } : {}),
      },
    },
    amenities: {
      features: positiveAmenities?.map((item) => item.value.note || item.value.code.replaceAll('_', ' ')),
      ...(firstParty.access?.parking?.availability?.value === 'yes' ? { parking: true } : {}),
      ...(amenityCodes.has('restrooms') ? { restrooms: true } : {}),
      ...(amenityCodes.has('picnic_area') ? { picnic_area: true } : {}),
      ...(firstParty.access?.accessibility_note ? { wheelchair_accessible: true } : {}),
      ...(petPolicy === 'allowed' ? { pet_friendly: true } : {}),
    },
    products: {
      items: firstParty.products?.items?.map((item) => item.value),
      production_methods: firstParty.products?.production_methods?.map((item) => item.value),
      categories: categoryFlags,
    },
  };
}

export function mergeEnrichment<T extends MergeableMarket>(
  market: T,
  enrichment: MarketEnrichmentRecord | undefined,
  audit: MarketAuditMetadata | undefined
): T & MergeableMarket {
  if (!enrichment) return audit ? { ...market, audit } : market;

  const projected = projectFirstPartyFacts(enrichment.first_party);

  return {
    ...market,
    schema_version: enrichment.schema_version ?? market.schema_version,
    first_party: enrichment.first_party ?? market.first_party,
    google_maps_url: enrichment.google_maps_url ?? market.google_maps_url,
    suppress_map: enrichment.suppress_map ?? market.suppress_map,
    visitor_note: enrichment.visitor_note ?? market.visitor_note,
    contact: {
      ...market.contact,
      websites: uniqueStrings(enrichment.contact?.websites, market.contact?.websites),
      social_media: uniqueStrings(
        enrichment.contact?.social_media,
        projected.contact?.social_media,
        market.contact?.social_media
      ),
      phone_numbers: uniquePhoneNumbers(enrichment.contact?.phone_numbers, market.contact?.phone_numbers),
      emails: uniqueStrings(enrichment.contact?.emails, market.contact?.emails),
    },
    operations: {
      ...market.operations,
      ...projected.operations,
      ...(enrichment.operations?.season ? { season: enrichment.operations.season } : {}),
      ...(enrichment.operations?.days?.length ? { days: enrichment.operations.days } : {}),
    },
    payment: {
      ...market.payment,
      ...projected.payment,
      methods: enrichment.payment?.methods?.length
        ? uniqueStrings(enrichment.payment.methods, projected.payment?.methods, market.payment?.methods)
        : uniqueStrings(projected.payment?.methods, market.payment?.methods),
      food_assistance: {
        ...market.payment?.food_assistance,
        ...projected.payment?.food_assistance,
        ...enrichment.payment?.food_assistance,
      },
    },
    amenities: {
      ...market.amenities,
      ...projected.amenities,
      ...enrichment.amenities,
      features: uniqueStrings(
        enrichment.amenities?.features,
        projected.amenities?.features,
        market.amenities?.features
      ),
    },
    products: {
      ...market.products,
      ...projected.products,
      items: uniqueStrings(projected.products?.items, market.products?.items),
      production_methods: uniqueStrings(
        projected.products?.production_methods,
        market.products?.production_methods
      ),
      categories: {
        ...market.products?.categories,
        ...projected.products?.categories,
      },
    },
    enrichment: {
      verified_at: enrichment.verified_at,
      verification_scope: enrichment.verification_scope ?? 'partial',
      sources: enrichment.sources,
    },
    audit,
  };
}
