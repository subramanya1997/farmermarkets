import type {
  ASSISTANCE_CODES,
  AVAILABILITY,
  EVENT_KINDS,
  INCENTIVE_KINDS,
  MARKET_STATUSES,
  PAYMENT_CODES,
  PET_RULES,
  PRODUCT_CODES,
  PROGRAM_KINDS,
  SOCIAL_PLATFORMS,
  Weekday,
} from '@/lib/listingEdits';

/** Human labels for the listing schema codes, as organizers see them. */

export const STATUS_LABELS: Record<(typeof MARKET_STATUSES)[number], string> = {
  active: 'Open as usual',
  seasonal_break: 'Closed for the season',
  temporarily_closed: 'Temporarily closed',
  permanently_closed: 'Closed for good',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export const WEEKDAY_LONG: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const PAYMENT_LABELS: Record<(typeof PAYMENT_CODES)[number], string> = {
  cash: 'Cash',
  credit_card: 'Credit cards',
  debit_card: 'Debit cards',
  check: 'Checks',
  mobile_wallet: 'Apple Pay or Google Pay',
  contactless: 'Tap to pay',
  market_token: 'Market tokens',
};

export const ASSISTANCE_LABELS: Record<(typeof ASSISTANCE_CODES)[number], string> = {
  snap_ebt: 'SNAP / EBT',
  wic: 'WIC',
  fmnp: 'WIC farmers market checks (FMNP)',
  sfmnp: 'Senior farmers market checks (SFMNP)',
};

export const INCENTIVE_LABELS: Record<(typeof INCENTIVE_KINDS)[number], string> = {
  match: 'Dollar match',
  bonus: 'Bonus tokens',
  discount: 'Discount',
  voucher: 'Voucher',
};

export const PRODUCT_LABELS: Record<(typeof PRODUCT_CODES)[number], string> = {
  fresh_produce: 'Fruits and vegetables',
  meat: 'Meat',
  dairy: 'Dairy and cheese',
  eggs: 'Eggs',
  herbs: 'Herbs',
  crafts: 'Crafts',
  prepared_food: 'Prepared food',
  baked_goods: 'Baked goods',
  flowers: 'Flowers',
  honey: 'Honey',
  preserves: 'Jams and preserves',
  wine: 'Wine',
};

export const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  x: 'X (Twitter)',
  youtube: 'YouTube',
  other: 'Other',
};

export const EVENT_LABELS: Record<(typeof EVENT_KINDS)[number], string> = {
  music: 'Live music',
  workshop: 'Workshop or demo',
  kids: 'Kids activity',
  festival: 'Festival',
  special_market: 'Special market day',
  other: 'Other',
};

export const PROGRAM_LABELS: Record<(typeof PROGRAM_KINDS)[number], string> = {
  nutrition: 'Nutrition',
  kids_club: 'Kids club',
  food_access: 'Food access',
  composting: 'Composting',
  community: 'Community',
  education: 'Education',
  other: 'Other',
};

export const AVAILABILITY_LABELS: Record<(typeof AVAILABILITY)[number], string> = {
  yes: 'Yes',
  limited: 'Limited',
  no: 'No',
};

export const PET_LABELS: Record<(typeof PET_RULES)[number], string> = {
  allowed: 'Pets welcome',
  service_animals_only: 'Service animals only',
  not_allowed: 'No pets',
};
