import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { formatDate } from '@/lib/marketFacts';
import { prune } from '@/lib/schema';
import { SITE_URL, absoluteUrl } from '@/lib/site';
import {
  USDA_EXPORT_URL,
  USDA_PORTAL_URL,
  getDatasetPageData,
  type DatasetPageData,
} from '@/lib/datasetPage';

export const revalidate = 86400;

const PATH = '/about-the-data';

const TITLE = 'About the data';
const DESCRIPTION =
  'Where the farmers market directory comes from, how the records are processed and how often they are refreshed: USDA Local Food Portal directory data plus official government open-data portals.';

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

/** "6 of 10" as a whole-number percentage, for the coverage table. */
const share = (part: number, total: number) =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : '—';

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
 * `distribution` names the two snapshot files, which are genuinely served from
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
      <div className="mt-3 space-y-4 text-sm text-zinc-600 sm:text-base dark:text-zinc-400">
        {children}
      </div>
    </section>
  );
}

export default async function AboutTheDataPage() {
  const data = await getDatasetPageData();
  const { coverage, publishers, licenses, files } = data;

  const coverageRows: { label: string; value: string; note?: string }[] = [
    { label: 'Markets and local-food places', value: number(coverage.totalMarkets) },
    {
      label: 'From the USDA Local Food Portal directory',
      value: number(coverage.legacyMarkets),
      note: share(coverage.legacyMarkets, coverage.totalMarkets),
    },
    {
      label: 'From official government portals',
      value: number(coverage.officialMarkets),
      note: share(coverage.officialMarkets, coverage.totalMarkets),
    },
    { label: 'States, provinces and country hubs', value: number(coverage.stateCount) },
    { label: 'Cities with at least one listing', value: number(coverage.cityCount) },
    { label: 'Countries', value: number(coverage.countries.length) },
    {
      label: 'Records stating their opening times',
      value: number(coverage.withHoursCount),
      note: share(coverage.withHoursCount, coverage.totalMarkets),
    },
    {
      label: 'Records stating which days they trade',
      value: number(coverage.withDaysCount),
      note: share(coverage.withDaysCount, coverage.totalMarkets),
    },
    {
      label: 'Records recorded as accepting SNAP/EBT',
      value: number(coverage.snapCount),
      note: share(coverage.snapCount, coverage.totalMarkets),
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema(data)) }}
      />

      <div className="flex min-h-[calc(100vh-4rem)] flex-col">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-6 sm:py-8 md:py-12 dark:from-green-900/20 dark:to-zinc-950">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <Breadcrumbs items={[{ label: 'About the data', href: PATH }]} />
            <h1 className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-2xl font-bold tracking-tighter text-transparent sm:text-3xl md:text-4xl">
              About the data
            </h1>
            {/* Answer-first: the counts and the lineage are the first thing a
                reader — or an extractive crawler — sees. */}
            <p className="mt-4 max-w-3xl text-base text-zinc-700 sm:text-lg dark:text-zinc-300">
              This site is an independently maintained, regularly refreshed directory of{' '}
              {number(coverage.totalMarkets)} farmers markets and public local-food places in{' '}
              {number(coverage.cityCount)} cities across {coverage.countries.length} countries. It
              is built on directory data from the USDA Local Food Portal plus open data from{' '}
              {number(publishers.length)} government publishers, normalized to a single schema,
              corrected where the source geocoding was wrong, and labelled with the age of each
              record.
            </p>
          </div>
        </section>

        <section className="w-full bg-white py-6 sm:py-8 md:py-10 dark:bg-zinc-900">
          <div className="mx-auto w-full max-w-4xl space-y-10 px-4 sm:px-6">
            <Section id="what-this-is" heading="What this directory is">
              <p>
                One merged directory assembled from public sources. It is not an official
                government product and it is not affiliated with the USDA or with any of the
                publishers listed below; it is a third-party directory built on their published
                data, kept current against those same sources.
              </p>
              <p>
                Two files hold the whole thing. One carries the{' '}
                {number(coverage.legacyMarkets)} listings that originate in the USDA Local Food
                Portal directory. The other holds the {number(coverage.officialMarkets)} records from
                government open-data portals, and each one carries its publisher, dataset,
                catalogue URL and licence in its own <code>provenance</code> block, which is what
                the source line at the bottom of every market page prints.
              </p>
            </Section>

            <Section id="sources" heading="Where the data comes from">
              <p>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                  USDA Local Food Portal
                </strong>{' '}
                — {number(coverage.legacyMarkets)} records. The portal is live, and its farmers
                market directory publishes a keyless bulk export (
                <a
                  href={USDA_EXPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 underline hover:no-underline dark:text-green-500"
                >
                  the same endpoint its own CSV download button calls
                </a>
                ), which is what these records are refreshed against, matched on the portal&rsquo;s
                own listing ID. The directory itself is at{' '}
                <a
                  href={USDA_PORTAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-green-700 underline hover:no-underline dark:text-green-500"
                >
                  usdalocalfoodportal.com
                </a>
                . Listings there are self-reported by the markets.
              </p>
              <p>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Official government open-data portals
                </strong>{' '}
                — {number(coverage.officialMarkets)} records from {number(publishers.length)}{' '}
                publishers, refreshed nightly:
              </p>
              <ul className="space-y-3">
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
                              className="text-green-700 underline hover:no-underline dark:text-green-500"
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
            </Section>

            <Section id="processing" heading="How the records are processed">
              <p>
                Both files are normalized to one schema — name, address, coordinates, season, days,
                products, payment methods, food-assistance programs, amenities, contact details —
                so a Singapore hawker centre and a New York farmers market answer the same
                questions in the same fields. Categories that are not producer-only farmers markets
                keep their own label (public food market, food cooperative pickup, community
                garden, hawker centre) rather than being flattened into one word.
              </p>
              <p>
                A separate geo index resolves every record to a state or country hub and, where the
                address or coordinates allow it, to a city — collapsing the many spellings of the
                same state, recovering cities that the source left blank, and rejecting coordinates
                that fall outside the state the record claims. It currently places{' '}
                {number(coverage.totalMarkets - coverage.unplacedMarkets)} of{' '}
                {number(coverage.totalMarkets)} records;{' '}
                {number(coverage.unplacedMarkets)} carry no usable location at all and appear only
                in the full directory.
              </p>
              <p>
                Refreshes are conservative by design. Each government source is validated before it
                is written — invalid coordinates, duplicate IDs and slugs, record counts below a
                configured floor, and suspicious drops against the previous snapshot all reject the
                update, and a source that fails keeps its last good records while healthy sources
                update around it. On the USDA side only the fields the bulk export unambiguously
                provides are overwritten; contact details, schedules and parsed city/state/ZIP are
                left alone, because the export does not carry them and blanking them would be a
                loss. A URL is never regenerated for an existing record.
              </p>
              <p>
                <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Dates are mirrored, never invented.
                </strong>{' '}
                A record&rsquo;s &ldquo;last verified&rdquo; date is the upstream publisher&rsquo;s
                own timestamp, copied across; it is never set to the time of the refresh. That is
                why some listings here openly show a date from years ago instead of today&rsquo;s.
              </p>
            </Section>

            <Section id="cadence" heading="How often it updates">
              <p>
                The government sources are re-fetched by a scheduled job every day at 08:17 UTC.
                The run normalizes and validates each source, rebuilds the snapshot, runs the
                parser tests and a production build, and only then commits — so a broken upstream
                cannot land on the site.
                {data.lastRetrievedAt &&
                  ` Those sources were last retrieved on ${formatDate(data.lastRetrievedAt)}.`}
              </p>
              <p>
                The USDA half is refreshed on demand rather than nightly, because that is when
                upstream actually changes: a main pass in February or March, when markets update
                their listings ahead of opening day, a second pass mid-season, and ad-hoc runs
                after that. Changed pages are submitted to IndexNow as part of both refreshes.
              </p>
              {coverage.earliestUpdate && coverage.latestUpdate && (
                <p>
                  Across the whole directory, record dates run from {formatDate(coverage.earliestUpdate)}{' '}
                  to {formatDate(coverage.latestUpdate)}.
                </p>
              )}
            </Section>

            <Section id="coverage" heading="What the data covers">
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[22rem] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Coverage of the Farmer Markets directory, computed from the current data
                  </caption>
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Measure
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Count
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">
                        Share
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {coverageRows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row" className="px-4 py-2.5 font-medium">
                          {row.label}
                        </th>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.value}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-500">
                          {row.note ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>Countries covered: {coverage.countries.join(', ')}.</p>
            </Section>

            <Section id="limitations" heading="Known limitations">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    The sources are self-reported.
                  </span>{' '}
                  Markets fill in their own listings on the USDA portal, and government portals
                  publish what the market or the program administrator told them. A market can be
                  open and absent, or listed and closed.
                </li>
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Some records are old, and say so.
                  </span>{' '}
                  {number(coverage.staleCount)} listings carry an upstream date more than four
                  years back and are labelled &ldquo;may be out of date&rdquo; on their page.
                  {coverage.unverifiedCount > 0 && (
                    <>
                      {' '}
                      Another {number(coverage.unverifiedCount)} are no longer published in the
                      USDA directory at all; those pages say so plainly. Delisted records are
                      flagged rather than deleted — a listing can vanish because nobody renewed it,
                      not because the market shut, and a working URL is worth more than a guess.
                    </>
                  )}
                </li>
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Coverage is uneven.
                  </span>{' '}
                  Several government sources are deliberately partial — a single county, a single
                  city, or one program&rsquo;s authorized vendors rather than a complete national
                  directory. The scope note on each source above says which.
                </li>
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Not every record answers every field.
                  </span>{' '}
                  Opening times, days, payment methods and amenities are present only where the
                  source supplied them. Pages omit what they do not know instead of filling in a
                  plausible default, which is why two market pages can look very different.
                </li>
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Always check before you travel.
                  </span>{' '}
                  Weather, holidays and mid-season schedule changes never reach any of these
                  sources.
                </li>
              </ul>
            </Section>

            <Section id="corrections" heading="Reporting a correction">
              <p>
                Two routes, and they do different things.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Tell us directly.
                  </span>{' '}
                  A short form opens on the{' '}
                  <Link
                    href="/markets"
                    className="text-green-700 underline hover:no-underline dark:text-green-500"
                  >
                    market directory
                  </Link>
                  ; pick &ldquo;Update or correct a listing&rdquo; or &ldquo;Get a market or
                  local-food place listed&rdquo; and describe the change. It reaches a monitored
                  inbox.
                </li>
                <li>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    Fix it at the source.
                  </span>{' '}
                  This is the durable fix. A correction made with the original publisher — the
                  market&rsquo;s own listing on the USDA portal, or the government dataset linked
                  beside each publisher above — flows through on the next refresh and reaches every
                  other site that uses the same feed, not just this one.
                </li>
              </ul>
            </Section>

            <Section id="licensing" heading="Licensing and reuse">
              <p>
                There is no single licence covering the whole directory, and none is claimed here.
                Each official record carries its publisher&rsquo;s own terms in its{' '}
                <code>provenance</code> block, and those terms travel with the record — currently{' '}
                {licenses.length} distinct statements: {licenses.join('; ')}. The USDA Local Food
                Portal records carry no licence statement of their own. If you intend to reuse this
                data, read the terms of the specific source that produced the records you need, and
                credit that publisher.
              </p>
              <p>
                The two snapshots are served as-is, in the same shape the site reads them:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {files.map((file) => (
                  <li key={file.path}>
                    <a
                      href={file.path}
                      className="text-green-700 underline hover:no-underline dark:text-green-500"
                    >
                      {file.path}
                    </a>{' '}
                    — {file.name}
                    {file.size && ` · ${file.size} JSON`}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="keep-browsing" heading="Keep browsing">
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/markets"
                    className="text-green-700 underline hover:no-underline dark:text-green-500"
                  >
                    Every state and region in the directory
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="text-green-700 underline hover:no-underline dark:text-green-500"
                  >
                    About Farmer Markets
                  </Link>
                </li>
              </ul>
            </Section>
          </div>
        </section>
      </div>
    </>
  );
}
