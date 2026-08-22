const socialHosts = new Set([
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'linkedin.com',
]);

function normalizedSocialHost(hostname) {
  return hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '');
}

function timeRanges(value) {
  const ranges = [...String(value).matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi)];
  if (ranges.length > 0) {
    return new Set(ranges.map((range) => {
      const endMeridiem = range[6].toLowerCase().replace(/\./g, '');
      const startMeridiem = (range[3] ?? endMeridiem).toLowerCase().replace(/\./g, '');
      return `${range[1]}:${range[2] ?? '00'}${startMeridiem}-${range[4]}:${range[5] ?? '00'}${endMeridiem}`;
    }));
  }
  const matches = String(value).match(/\b(?:[01]?\d|2[0-3])(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi) ?? [];
  const fallback = matches.slice(0, 2).map((part) => part.toLowerCase().replace(/[.\s]/g, '')).join('-');
  return new Set(fallback ? [fallback] : []);
}

function weekdayKeys(value) {
  const matches = String(value).toLowerCase().match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/g) ?? [];
  return new Set(matches.map((day) => day.replace(/s$/, '')));
}

function hasSeasonContext(value) {
  return /\b(?:spring|summer|fall|autumn|winter|season|year[- ]round|january|february|march|april|may|june|july|august|september|october|november|december|jan\.?|feb\.?|mar\.?|apr\.?|jun\.?|jul\.?|aug\.?|sep(?:t)?\.?|oct\.?|nov\.?|dec\.?|20\d{2}|through|until)\b/i.test(value);
}

export function isCanonicalSocialProfileUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = normalizedSocialHost(url.hostname);
  if (!socialHosts.has(host) || value.includes('?') || value.includes('#')) return false;
  if (url.hostname.toLowerCase().startsWith('m.')) return false;
  if (host === 'facebook.com') {
    return !/(?:^|\/)(?:posts?|photos?|reels?|events?|watch|share|redirect|login|profile\.php|info|about)(?:\/|$)/i.test(url.pathname);
  }
  if (host === 'instagram.com') return !/^\/(?:p|reels?|stories|explore)(?:\/|$)/i.test(url.pathname);
  if (host === 'twitter.com' || host === 'x.com') return !/\/status(?:\/|$)/i.test(url.pathname);
  if (host === 'youtube.com') return !/^\/(?:watch|playlist|shorts)(?:\/|$)/i.test(url.pathname);
  if (host === 'tiktok.com') return !/\/video(?:\/|$)/i.test(url.pathname);
  if (host === 'linkedin.com') return !/^\/(?:feed|posts)(?:\/|$)/i.test(url.pathname);
  return true;
}

export function isGenericSingaporeNeaWebsite(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/^www\./, '') === 'nea.gov.sg'
      && url.pathname.replace(/\/+$/, '').toLowerCase() === '/our-services/hawker-management/overview';
  } catch {
    return false;
  }
}

export function isPastDatedSchedule(value, checkedAt) {
  const checkedYear = Number(String(checkedAt).slice(0, 4));
  const years = [...String(value).matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  return Number.isInteger(checkedYear) && years.length > 0 && Math.max(...years) < checkedYear;
}

export function isNonMarketSchedule(value) {
  return /\b(?:oneblood|blood drive|blood bus|live performances?|concerts?|fundraisers?|festivals?|vendor availability|competition|givebutter|admission|showtimes?|registration|municipal meeting)\b/i.test(String(value));
}

export function hasConflictingUnqualifiedSeasonalHours(days) {
  for (let leftIndex = 0; leftIndex < days.length; leftIndex += 1) {
    const leftDays = weekdayKeys(days[leftIndex]);
    const leftTimes = timeRanges(days[leftIndex]);
    if (leftTimes.size === 0 || leftDays.size === 0) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < days.length; rightIndex += 1) {
      const rightDays = weekdayKeys(days[rightIndex]);
      const rightTimes = timeRanges(days[rightIndex]);
      const sharedDay = [...leftDays].some((day) => rightDays.has(day));
      const sharedTime = [...leftTimes].some((time) => rightTimes.has(time));
      if (!sharedDay || rightTimes.size === 0 || sharedTime) continue;
      if (!hasSeasonContext(days[leftIndex]) || !hasSeasonContext(days[rightIndex])) return true;
    }
  }
  return false;
}

export function isKnownContaminatedPromotion(id, field, value) {
  if (id === '313062' && field === 'contact.social_media') {
    return String(value).replace(/\/+$/, '').toLowerCase() === 'https://www.facebook.com/chilhowie';
  }
  if (id === '313252' && field === 'contact.phone_numbers') {
    return String(value).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') === '4344762343';
  }
  if (id === '313252' && field === 'contact.websites') {
    return /townofhalifax\.com\/index\.php\?.*\b(?:id=125|itemid=337)\b/i.test(String(value));
  }
  return false;
}
