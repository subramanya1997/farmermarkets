import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { MarketPhotos } from '@/components/MarketPhotos';
import { TrackedExternalLink } from '@/components/TrackedExternalLink';
import { VendorConfirmedBadge, vendorSellsLine, vendorSellsList } from '@/components/VendorBits';
import { VendorOfferingBlock } from '@/components/VendorOffering';
import { SOCIAL_LABELS } from '@/components/organizer/editor/labels';
import { getMarketById } from '@/lib/data';
import { clean } from '@/lib/geo';
import { safeHighlightUrl } from '@/lib/marketHighlights';
import { vendorSchemaGraph } from '@/lib/schema';
import { displayName, vendorDescription, vendorTitle } from '@/lib/seo';
import { SITE_URL, absoluteUrl } from '@/lib/site';
import { SITE_FRAME } from '@/lib/ui';
import { usToday } from '@/lib/offeringDays';
import { getPublishedVendorBySlug, getPublishedVendors, type PublicOffering, type PublishedVendor } from '@/lib/vendorLayer';
import { attendanceLabel } from '@/lib/vendorRules';
import { jsonLdHtml } from '@/lib/jsonLd';

// Same policy as the market pages: prerender every published vendor, refresh
// daily, and render a vendor approved since the build on first request.
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const { bySlug } = await getPublishedVendors();
    return [...bySlug.keys()].sort().map((slug) => ({ slug }));
  } catch (error) {
    console.error('Could not list vendor pages:', error);
    return [];
  }
}

interface VendorPageProps {
  params: Promise<{ slug: string }>;
}

/** The vendor, or null for an unknown slug or an unreachable database. */
async function loadVendor(slug: string): Promise<PublishedVendor | null> {
  try {
    return await getPublishedVendorBySlug(slug);
  } catch (error) {
    console.error('Could not load vendor page:', error);
    return null;
  }
}

interface VendorMarket {
  slug: string;
  name: string;
  place: string;
  attendance: string;
  stallNote: string;
  confirmed: boolean;
  offerings: PublicOffering[];
}

/** The markets that approved this vendor and still exist, in a stable order. */
async function vendorMarkets(vendor: PublishedVendor): Promise<VendorMarket[]> {
  const found = await Promise.all(
    vendor.markets.map(async (entry) => {
      const market = await getMarketById(entry.marketId);
      if (!market?.slug) return null;
      return {
        slug: market.slug,
        name: displayName(market.name),
        place: [clean(market.city), clean(market.state)].filter(Boolean).join(', '),
        attendance: attendanceLabel(entry.days),
        stallNote: clean(entry.stallNote),
        confirmed: entry.confirmed,
        offerings: entry.offerings,
      };
    }),
  );
  const seen = new Set<string>();
  return found
    .filter((market): market is VendorMarket => Boolean(market))
    .filter((market) => (seen.has(market.slug) ? false : (seen.add(market.slug), true)))
    .sort((a, b) => Number(b.confirmed) - Number(a.confirmed) || a.name.localeCompare(b.name));
}

/** Vendor text keeps its paragraph breaks; each paragraph is cleaned on its own. */
function paragraphs(value?: string): string[] {
  return (value ?? '').split(/\r?\n/).map((part) => clean(part)).filter(Boolean);
}

function telHref(value: string): string | undefined {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : undefined;
}

export async function generateMetadata({ params }: VendorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const vendor = await loadVendor(slug);
  if (!vendor) {
    return {
      title: 'Vendor Not Found',
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }

  const { profile } = vendor;
  const markets = await vendorMarkets(vendor);
  const title = vendorTitle(profile.name);
  const description = vendorDescription({
    name: profile.name,
    sells: vendorSellsList(profile.products, profile.items),
    markets: markets.map((market) => ({ name: market.name, place: market.place })),
  });
  const path = `/vendors/${vendor.slug}`;
  const cover = profile.photos[0];
  const images = cover
    ? [{ url: cover.url, width: cover.width, height: cover.height, alt: clean(cover.alt) || clean(profile.name) }]
    : undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: 'profile', ...(images ? { images } : {}) },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, ...(images ? { images: [images[0].url] } : {}) },
  };
}

const CONTACT_LINK =
  'inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40';

export default async function VendorPage({ params }: VendorPageProps) {
  const { slug } = await params;
  const vendor = await loadVendor(slug);
  if (!vendor) notFound();

  const { profile } = vendor;
  const name = clean(profile.name);
  const markets = await vendorMarkets(vendor);
  const rendered = usToday();
  const sells = vendorSellsLine(profile.products, profile.items, 8);
  const about = paragraphs(profile.description);
  const website = safeHighlightUrl(profile.website);
  const socials = profile.social_profiles
    .map((social) => ({ label: SOCIAL_LABELS[social.platform] ?? 'Social profile', href: safeHighlightUrl(social.url) }))
    .filter((social): social is { label: string; href: string } => Boolean(social.href))
    .map((social) => ({ ...social, label: social.label === 'Other' ? new URL(social.href).hostname.replace(/^www\./, '') : social.label }));
  const phone = clean(profile.phone);
  const phoneHref = phone ? telHref(phone) : undefined;
  const email = clean(profile.email);
  const photos = profile.photos.map((photo) => ({ url: photo.url, width: photo.width, height: photo.height, alt: photo.alt }));
  const analyticsProperties = { vendor_slug: vendor.slug, page_type: 'vendor' };
  const hasContact = Boolean(website || socials.length || (phone && phoneHref) || email);
  const summary = vendorDescription({
    name: profile.name,
    sells: vendorSellsList(profile.products, profile.items),
    markets: markets.map((market) => ({ name: market.name, place: market.place })),
  });

  const jsonLd = vendorSchemaGraph(
    {
      slug: vendor.slug,
      name,
      description: summary,
      images: photos.map((photo) => photo.url),
      website,
      socialUrls: socials.map((social) => social.href),
      phone: phoneHref ? phone : undefined,
      email: email || undefined,
      marketUrls: markets.map((market) => absoluteUrl(`/markets/${market.slug}`)),
    },
    { siteUrl: SITE_URL },
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />
      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 md:py-12 dark:from-green-900/20 dark:to-zinc-950">
          <div className={SITE_FRAME}>
            <div className="flex flex-col gap-3 sm:gap-4">
              <Breadcrumbs items={[{ label: name, href: `/vendors/${vendor.slug}` }]} />
              <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl lg:text-5xl">
                {name}
              </h1>
              {sells && <p className="max-w-[75ch] text-base text-zinc-600 sm:text-lg dark:text-zinc-400">{sells}</p>}
            </div>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-12 dark:bg-zinc-900">
          <div className={SITE_FRAME}>
            <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr] 2xl:grid-cols-[minmax(0,1fr)_32rem] 2xl:gap-10">
              <div className="min-w-0">
                {about.map((paragraph, index) => (
                  <p
                    key={index}
                    className="mb-3 max-w-[75ch] text-sm text-zinc-600 last:mb-0 sm:text-base dark:text-zinc-400"
                  >
                    {paragraph}
                  </p>
                ))}

                {photos.length > 0 && (
                  <div className={about.length ? 'mt-6' : undefined}>
                    <MarketPhotos photos={photos} marketName={name} />
                  </div>
                )}

                <section aria-labelledby="vendor-markets-heading" className={about.length || photos.length ? 'mt-8 sm:mt-10' : undefined}>
                  <h2 id="vendor-markets-heading" className="mb-3 text-lg font-semibold tracking-tight sm:text-xl">
                    Find them at
                  </h2>
                  {markets.length > 0 ? (
                    <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                      {markets.map((market) => {
                        const when = [market.attendance, market.stallNote].filter(Boolean).join(' · ');
                        return (
                          <li key={market.slug} className="relative p-3 transition-colors hover:bg-zinc-50 sm:p-4 dark:hover:bg-zinc-800/50">
                            <p className="font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                              <Link
                                href={`/markets/${market.slug}`}
                                className="after:absolute after:inset-0 hover:text-green-700 hover:underline dark:hover:text-green-500"
                              >
                                {market.name}
                              </Link>
                            </p>
                            {market.place && (
                              <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                                {market.place}
                              </p>
                            )}
                            {when && <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{when}</p>}
                            {market.confirmed && (
                              <p className="mt-1.5">
                                <VendorConfirmedBadge />
                              </p>
                            )}
                            <VendorOfferingBlock offerings={market.offerings} rendered={rendered} />
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Not listed at a market yet.</p>
                  )}
                </section>
              </div>

              <aside className="min-w-0">
                {hasContact && (
                  <section
                    aria-labelledby="vendor-contact-heading"
                    className="rounded-2xl border border-zinc-200 p-3 sm:p-4 lg:sticky lg:top-24 dark:border-zinc-800"
                  >
                    <h2 id="vendor-contact-heading" className="mb-2 px-3 text-lg font-semibold tracking-tight">
                      Contact
                    </h2>
                    <ul className="space-y-0.5">
                      {website && (
                        <li>
                          <TrackedExternalLink
                            href={website}
                            target="_blank"
                            rel="noopener noreferrer nofollow ugc"
                            className={CONTACT_LINK}
                            eventName="Vendor Website Opened"
                            eventProperties={{ ...analyticsProperties, destination_host: new URL(website).hostname }}
                          >
                            <Globe aria-hidden="true" className="size-4 shrink-0" />
                            <span className="truncate">{new URL(website).hostname.replace(/^www\./, '')}</span>
                          </TrackedExternalLink>
                        </li>
                      )}
                      {socials.map((social) => (
                        <li key={social.href}>
                          <TrackedExternalLink
                            href={social.href}
                            target="_blank"
                            rel="noopener noreferrer nofollow ugc"
                            className={CONTACT_LINK}
                            eventName="Vendor Social Profile Opened"
                            eventProperties={{ ...analyticsProperties, destination_host: new URL(social.href).hostname }}
                          >
                            <Globe aria-hidden="true" className="size-4 shrink-0" />
                            <span className="truncate">{social.label}</span>
                          </TrackedExternalLink>
                        </li>
                      ))}
                      {phone && phoneHref && (
                        <li>
                          <a href={phoneHref} className={CONTACT_LINK}>
                            <Phone aria-hidden="true" className="size-4 shrink-0" />
                            {phone}
                          </a>
                        </li>
                      )}
                      {email && (
                        <li>
                          <a href={`mailto:${email}`} className={CONTACT_LINK}>
                            <Mail aria-hidden="true" className="size-4 shrink-0" />
                            <span className="truncate">{email}</span>
                          </a>
                        </li>
                      )}
                    </ul>
                  </section>
                )}
              </aside>
            </div>

            <p className="mt-10 text-sm text-zinc-600 dark:text-zinc-400">
              Is this your business?{' '}
              <Link
                href="/sign-in?next=%2Fvendor"
                rel="nofollow"
                className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
              >
                Manage this page
              </Link>
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
