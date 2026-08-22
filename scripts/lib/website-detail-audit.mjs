import { extractEvidenceExcerpts, sha256 } from './website-audit.mjs';

const SOCIAL_HOSTS = new Set([
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
]);

const SOCIAL_NAVIGATION_SEGMENTS = /\/(?:events?|explore|hashtag|login|p|photos?|posts?|reels?|share|stories|status|watch)(?:\/|$)/i;

export function canonicalSocialProfile(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!SOCIAL_HOSTS.has(host) || SOCIAL_NAVIGATION_SEGMENTS.test(url.pathname)) return undefined;
    if (host === 'youtube.com' && !/^\/(?:@|channel\/|c\/|user\/)/i.test(url.pathname)) return undefined;
    if (['facebook.com', 'instagram.com', 'tiktok.com', 'twitter.com', 'x.com'].includes(host)) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length !== 1 || ['home', 'marketplace', 'search'].includes(segments[0].toLowerCase())) return undefined;
    }
    url.search = '';
    url.hash = '';
    url.hostname = host;
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return undefined;
  }
}

function sameSite(left, right) {
  const normalize = (host) => host.toLowerCase().replace(/^www\./, '');
  return normalize(left.hostname) === normalize(right.hostname);
}

export function detailLinkScore(link, baseUrl) {
  let url;
  try {
    url = new URL(link.href, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || !sameSite(url, new URL(baseUrl))) return 0;
  } catch {
    return 0;
  }
  const text = `${link.text ?? ''} ${url.pathname} ${url.search}`.toLowerCase();
  if (/\b(?:privacy|terms|careers?|donate|sponsor|advertis|press|news|blog|vendor application|become a vendor)\b/.test(text)) return 0;
  let score = 0;
  if (/\b(?:faq|frequently asked|visitor info|visit us|plan your visit)\b/.test(text)) score = 100;
  else if (/\b(?:accessibility|ada|parking|directions?|transit|transportation|payment|snap|ebt|wic|benefits?)\b/.test(text)) score = 90;
  else if (/\b(?:hours?|schedule|season|location|market info|about the market)\b/.test(text)) score = 80;
  else if (/\b(?:vendors?|seller|market map|newsletter|subscribe|contact)\b/.test(text)) score = 60;
  if (/\b(?:events?|calendar|music|festival)\b/.test(text)) score -= 30;
  return Math.max(0, score);
}

export function selectDetailLinks(links, baseUrl, limit = 2) {
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .map((link) => ({ ...link, score: detailLinkScore(link, baseUrl) }))
    .filter((link) => link.score > 0)
    .sort((left, right) => right.score - left.score || left.href.localeCompare(right.href, 'en'))
    .filter((link) => {
      const normalized = new URL(link.href, baseUrl);
      normalized.hash = '';
      const key = normalized.toString();
      if (seen.has(key) || key === baseUrl) return false;
      seen.add(key);
      link.href = key;
      return true;
    })
    .slice(0, limit)
    .map((link) => {
      const result = { ...link };
      delete result.score;
      return result;
    });
}

export function contactArtifacts(links) {
  const socials = new Set();
  const newsletters = new Set();
  for (const link of Array.isArray(links) ? links : []) {
    const social = canonicalSocialProfile(link.href);
    if (social) socials.add(social);
    const text = `${link.text ?? ''} ${link.href}`;
    if (/\b(?:newsletter|subscribe|mailing list|email updates)\b/i.test(text) && /^https?:/i.test(link.href)) {
      newsletters.add(link.href);
    }
  }
  return {
    social_profiles: [...socials].sort(),
    newsletter_urls: [...newsletters].sort(),
  };
}

export function detailPageRecord(snapshot) {
  const evidence = extractEvidenceExcerpts(snapshot.main_text, 8);
  return {
    url: snapshot.final_url,
    title: snapshot.title,
    h1: Array.isArray(snapshot.h1) ? snapshot.h1 : typeof snapshot.h1 === 'string' ? [snapshot.h1] : [],
    main_text_hash: sha256(snapshot.main_text),
    evidence,
    ...contactArtifacts(snapshot.links),
  };
}
