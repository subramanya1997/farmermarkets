/**
 * Human labels for the codes and values in `ListingEdits`, plus the small
 * date helpers the admin pages share. Pure, so server and client components
 * can both use it.
 */
import { AMENITY_LABELS } from '@/lib/organizerOverlay';
import { CLAIM_ROLE_LABELS, type ClaimRole } from '@/lib/claimRoles';
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

export const STATUS_LABELS: Record<(typeof MARKET_STATUSES)[number], string> = {
  active: 'Open as usual',
  seasonal_break: 'Closed for the season',
  temporarily_closed: 'Temporarily closed',
  permanently_closed: 'Permanently closed',
};

export const PAYMENT_LABELS: Record<(typeof PAYMENT_CODES)[number], string> = {
  cash: 'Cash',
  credit_card: 'Credit card',
  debit_card: 'Debit card',
  check: 'Check',
  mobile_wallet: 'Mobile wallet',
  contactless: 'Contactless',
  market_token: 'Market tokens',
};

export const ASSISTANCE_LABELS: Record<(typeof ASSISTANCE_CODES)[number], string> = {
  snap_ebt: 'SNAP/EBT',
  wic: 'WIC',
  fmnp: 'FMNP',
  sfmnp: 'Senior FMNP',
};

export const INCENTIVE_LABELS: Record<(typeof INCENTIVE_KINDS)[number], string> = {
  match: 'Match',
  bonus: 'Bonus',
  discount: 'Discount',
  voucher: 'Voucher',
};

export const PRODUCT_LABELS: Record<(typeof PRODUCT_CODES)[number], string> = {
  fresh_produce: 'Fresh produce',
  meat: 'Meat',
  dairy: 'Dairy',
  eggs: 'Eggs',
  herbs: 'Herbs',
  crafts: 'Crafts',
  prepared_food: 'Prepared food',
  baked_goods: 'Baked goods',
  flowers: 'Flowers',
  honey: 'Honey',
  preserves: 'Preserves',
  wine: 'Wine',
};

export { AMENITY_LABELS };

export const SOCIAL_LABELS: Record<(typeof SOCIAL_PLATFORMS)[number], string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  x: 'X',
  youtube: 'YouTube',
  other: 'Other',
};

export const EVENT_LABELS: Record<(typeof EVENT_KINDS)[number], string> = {
  music: 'Music',
  workshop: 'Workshop',
  kids: 'Kids',
  festival: 'Festival',
  special_market: 'Special market',
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
  no: 'No',
  limited: 'Limited',
};

export const PET_LABELS: Record<(typeof PET_RULES)[number], string> = {
  allowed: 'Pets allowed',
  not_allowed: 'No pets',
  service_animals_only: 'Service animals only',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function weekdayLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** "09:00" to "9:00 AM". */
export function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${match[2]} ${suffix}`;
}

/** "2027-05-01" to "May 1, 2027". */
export function formatDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : value;
}

export function formatMonthDay({ month, day }: { month: number; day?: number }): string {
  const name = MONTHS[month - 1] ?? String(month);
  return day ? `${name} ${day}` : name;
}

export function roleLabel(role: string): string {
  return CLAIM_ROLE_LABELS[role as ClaimRole] ?? role;
}

export function placeLabel(market: { city?: string; state?: string } | null | undefined): string {
  return [market?.city, market?.state].filter(Boolean).join(', ');
}

/** Absolute timestamp for a `title` attribute, in UTC so it reads the same everywhere. */
export function formatTimestamp(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(value) + ' UTC';
}

/** "just now", "5 min ago", "3 hours ago", "2 days ago", then a date. */
export function timeAgo(date: Date | string, now = Date.now()): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(value);
}

/** Only http(s) links are ever rendered as links. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** A URL without the protocol, for compact display. */
export function shortUrl(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
