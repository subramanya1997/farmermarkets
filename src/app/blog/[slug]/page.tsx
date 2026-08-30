import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts, getPost, blogPath } from "@/lib/blog";
import { BlogCover } from "@/components/BlogCover";
import { BlogProse } from "@/components/BlogProse";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { absoluteUrl } from "@/lib/site";
import { SITE_FRAME_GUTTER } from "@/lib/ui";

export const revalidate = 86400;
// Posts are code: an unknown slug can never become real without a deploy.
export const dynamicParams = false;

interface BlogPostPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: blogPath(post.slug),
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url: blogPath(post.slug),
      type: 'article',
      publishedTime: post.publishedAt,
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
    },
  };
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    url: absoluteUrl(blogPath(post.slug)),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    // The root layout's Organization node is the publisher; naming it here by
    // reference keeps the two from drifting apart.
    author: {
      '@type': 'Organization',
      name: 'Farmer Markets',
      url: absoluteUrl('/'),
    },
    mainEntityOfPage: absoluteUrl(blogPath(post.slug)),
  };

  const contents = post.headings.filter((heading) => heading.depth === 2);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <div className="min-h-[calc(100vh-4rem)] bg-white dark:bg-zinc-900">
        <article className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-5xl py-8 sm:py-12`}>
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title, href: blogPath(post.slug) }]} />
          </div>

          {/* Editorial header: centered title, then the byline row. */}
          <header className="mx-auto mt-6 max-w-3xl text-center">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl md:text-[2.75rem] md:leading-[1.15]">
              {post.title}
            </h1>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">Farmer Markets</span>
              <span aria-hidden="true">·</span>
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              {post.updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Updated <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{post.readingMinutes} min read</span>
              <span className="inline-flex items-center rounded-sm bg-green-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-green-800 dark:bg-green-900/40 dark:text-green-300">
                {post.tag}
              </span>
            </p>
          </header>

          <div className="mx-auto mt-8 aspect-[1200/630] max-w-4xl overflow-hidden rounded-xl">
            <BlogCover slug={post.slug} title={post.title} theme={post.cover} />
          </div>

          {/* Contents rail beside the article on wide screens. */}
          <div className="mx-auto mt-10 flex max-w-4xl gap-10">
            {contents.length > 1 && (
              <nav
                aria-label="Contents"
                className="hidden w-52 shrink-0 lg:block"
              >
                <div className="sticky top-24">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Contents</p>
                  <ul className="mt-3 space-y-2 border-l border-zinc-200 dark:border-zinc-800">
                    {contents.map((heading) => (
                      <li key={heading.id}>
                        <a
                          href={`#${heading.id}`}
                          className="-ml-px block border-l border-transparent pl-3 text-[13px] leading-5 text-zinc-500 transition-colors hover:border-green-600 hover:text-green-700 dark:text-zinc-400 dark:hover:text-green-400"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            )}

            <div className="min-w-0 max-w-3xl flex-1">
              {/* The post's markdown is rendered by the strict in-repo
                  renderer (`src/lib/markdown.ts`), which escapes all HTML in
                  the source. */}
              <BlogProse>
                <div dangerouslySetInnerHTML={{ __html: post.html }} />
              </BlogProse>

              <footer className="mt-12 rounded-xl border border-green-600/20 bg-green-50 p-5 dark:border-green-500/20 dark:bg-green-900/20">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Looking for a market near you? The{' '}
                  <Link href="/" className="font-medium text-green-700 underline underline-offset-2 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                    directory
                  </Link>{' '}
                  lists thousands of farmers markets with hours, market days, and SNAP/EBT acceptance.
                </p>
              </footer>
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
