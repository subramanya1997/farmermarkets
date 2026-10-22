import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { formatDate } from '@/lib/marketFacts';
import { prune } from '@/lib/schema';
import { SITE_URL, absoluteUrl } from '@/lib/site';
import {
  USDA_PORTAL_URL,
  getDatasetPageData,
  type DatasetPageData,
} from '@/lib/datasetPage';
import { SITE_FRAME_GUTTER } from '@/lib/ui';

export const revalidate = 86400;

const PATH = '/about-the-data';

const TITLE = 'About the data';
const DESCRIPTION =
  'Where the farmers market listings come from, how current they are and what they do not cover: USDA Local Food Portal data plus official government open-data portals.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} | Farmer Markets`,
    description: DESCRIPTION,
    url: PATH,
  },
};

const number = (value: number) => value.toLocaleString('en-US');

/**
 * The `Dataset` node.
 *
 * Only properties the data can answer are emitted, and the whole node goes
 * through the same `prune()` the market graph uses, so an absent date range or
 * an empty country list drops its property instead of publishing a blank.
 *
 * Two deliberate omissions:
 *
 *  - **`license`.** There is no single licence. The official records carry
 *    eight different statements from eight publishers, and the USDA directory
 *    records carry none at all. A `license` here would have to name one of
 *    them for all of it, which would be false; the per-source terms are listed
 *    on the page instead.
 *  - **`creativeWorkStatus`, `measurementTechnique`, and friends.** Nothing to
 *    say that the page does not already say.
 *
 * `distribution` names the canonical dataset, which is genuinely served from
 * the site root (`public/data/`) and are not disallowed in `robots.txt`.
 */
function datasetSchema(data: DatasetPageData) {
  const { coverage } = data;
  const url = absoluteUrl(PATH);

  const temporalCoverage =
    coverage.earliestUpdate && coverage.latestUpdate
      ? `${coverage.earliestUpdate}/${coverage.latestUpdate}`
      : undefined;

  // Deduped: several sources from one publisher can share a catalogue page,
  // and the same URL twice in `isBasedOn` says nothing the first one did not.
  const catalogUrls = [
    ...new Set(
      data.publishers.flatMap((publisher) =>
        publisher.datasets
          .map((dataset) => dataset.catalogUrl)
          .filter((url): url is string => Boolean(url))
      )
    ),
  ];

  return prune({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${url}#dataset`,
    name: 'Farmer Markets directory',
    description: `A directory of ${number(coverage.totalMarkets)} farmers markets and public local-food places in ${number(coverage.cityCount)} cities across ${coverage.countries.join(', ')}, built from USDA Local Food Portal directory data and open data published by ${number(data.publishers.length)} government bodies, normalized to one schema and refreshed from the upstream publishers.`,
    url,
    creator: { '@id': `${SITE_URL}#organization` },
    publisher: { '@id': `${SITE_URL}#organization` },
    isBasedOn: [USDA_PORTAL_URL, ...catalogUrls],
    temporalCoverage,
    dateModified: coverage.latestUpdate,
    spatialCoverage: coverage.countries.map((country) => ({
      '@type': 'Place',
      name: country,
    })),
    keywords: [
      'farmers markets',
      'farmers market directory',
      'local food',
      'SNAP/EBT farmers markets',
      'USDA Local Food Portal',
      'open data',
    ],
    distribution: data.files.map((file) => ({
      '@type': 'DataDownload',
      name: file.name,
      contentUrl: absoluteUrl(file.path),
      encodingFormat: 'application/json',
      contentSize: file.size,
    })),
  });
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

const LINK = 'text-green-700 underline underline-offset-2 hover:no-underline dark:text-green-500';

export default async function AboutTheDataPage() {
  const data = await getDatasetPageData();
  const { coverage, publishers, files } = data;

  // Every number here is computed from the committed data at build/ISR time.
  const stats: { label: string; value: string }[] = [
    { label: 'Listings', value: number(coverage.totalMarkets) },
    { label: 'Cities', value: number(coverage.cityCount) },
    { label: 'Countries', value: number(coverage.countries.length) },
    { label: 'Take SNAP/EBT', value: number(coverage.snapCount) },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema(data)) }}
      />

      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 md:py-12 dark:from-green-900/20 dark:to-zinc-950">
          <div className={`w-full max-w-3xl ${SITE_FRAME_GUTTER}`}>
            <Breadcrumbs items={[{ label: 'About the data', href: PATH }]} />
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
              About the data
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
              The listings come from the{' '}
              <a href={USDA_PORTAL_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                USDA Local Food Portal
              </a>{' '}
              and open data from {number(publishers.length)} government publishers. This site is
              independent and not affiliated with any of them.
            </p>
            <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="w-full bg-white py-8 sm:py-10 dark:bg-zinc-900">
          <div className={`w-full max-w-3xl space-y-10 ${SITE_FRAME_GUTTER}`}>
            <Section id="freshness" heading="How it stays current">
              <p>
                Each record is converted to the same set of fields, placed in its state and city,
                and checked before it goes live; a source that fails those checks keeps its last
                good records. A scheduled job checks the government sources daily and publishes
                only changes that pass
                {data.lastRetrievedAt
                  ? `, and they were last retrieved on ${formatDate(data.lastRetrievedAt)}.`
                  : '.'}{' '}
                The USDA listings are refreshed a few times a year, mostly before and during the
                market season, and every listing shows its source&rsquo;s own date, not the day we
                copied it.
              </p>
            </Section>

            <Section id="limitations" heading="What to keep in mind">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Markets report their own details, so a market can be open and missing, or listed
                  and closed.
                </li>
                <li>
                  {number(coverage.staleCount)} listings have a source date more than four years old
                  and are marked &ldquo;may be out of date&rdquo;.
                  {coverage.unverifiedCount > 0 &&
                    ` Another ${number(coverage.unverifiedCount)} are no longer in the USDA directory, and their pages say so.`}
                </li>
                <li>
                  Some sources cover one county, city or program, not a whole country, so coverage
                  is uneven.
                </li>
                <li>
                  Hours, days and payment details appear only where the source has them. Check with
                  the market before you travel.
                </li>
              </ul>
            </Section>

            <Section id="corrections" heading="Fixing a listing">
              <p>
                Run a market?{' '}
                <Link href="/for-market-operators" className={LINK}>
                  Add or correct your listing
                </Link>
                . A fix made with the original publisher (your USDA Local Food Portal listing, or
                the government dataset below) also reaches every other site that uses the same
                feed.
              </p>
            </Section>

            <details id="sources" className="group scroll-mt-20 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                <span>
                  Sources and licences
                  <span className="ml-2 text-sm font-normal text-zinc-500 dark:text-zinc-400">
                    {number(publishers.length + 1)} publishers
                  </span>
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="space-y-5 border-t border-zinc-200 px-5 py-4 text-sm leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <ul className="space-y-3">
                  <li>
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {number(coverage.legacyMarkets)} records from the{' '}
                      <a href={USDA_PORTAL_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
                        USDA Local Food Portal
                      </a>
                    </span>
                    <span className="block text-xs sm:text-sm">Listings are self-reported by the markets.</span>
                  </li>
                  {publishers.map((publisher) => (
                    <li key={publisher.publisher}>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {number(publisher.recordCount)} record
                        {publisher.recordCount === 1 ? '' : 's'} from {publisher.publisher}
                      </span>
                      <ul className="mt-1 space-y-1 text-xs sm:text-sm">
                        {publisher.datasets.map((dataset) => (
                          <li key={dataset.sourceId}>
                            {dataset.catalogUrl ? (
                              <a
                                href={dataset.catalogUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={LINK}
                              >
                                {dataset.datasetName ?? dataset.sourceId}
                              </a>
                            ) : (
                              (dataset.datasetName ?? dataset.sourceId)
                            )}
                            {dataset.license && ` · ${dataset.license}`}
                            {dataset.retrievedAt &&
                              ` · retrieved ${formatDate(dataset.retrievedAt)}`}
                            {dataset.scopeNote && <> · {dataset.scopeNote}</>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p>
                  There is no single licence for the whole directory. Each official record carries
                  its publisher&rsquo;s terms, listed above; the USDA records carry none. If you
                  reuse the data, follow the terms of the source you use and credit that publisher.
                </p>
                <p>Countries: {coverage.countries.join(', ')}.</p>
                {files.map((file) => (
                  <p key={file.path}>
                    Download:{' '}
                    <a href={file.path} className={LINK}>
                      {file.path}
                    </a>
                    {file.size && ` (${file.size} JSON)`}
                  </p>
                ))}
              </div>
            </details>
          </div>
        </section>
      </div>
    </>
  );
}
