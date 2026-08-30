import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts, getPost, blogPath } from "@/lib/blog";
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <div className="min-h-[calc(100vh-4rem)] bg-white dark:bg-zinc-900">
        <article className={`${SITE_FRAME_GUTTER} mx-auto w-full max-w-3xl py-8 sm:py-12`}>
          <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: post.title, href: blogPath(post.slug) }]} />

          <header className="mb-8 mt-4">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl md:text-4xl">
              {post.title}
            </h1>
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
              {post.updatedAt && (
                <>
                  {' · Updated '}
                  <time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>
                </>
              )}
              {` · ${post.readingMinutes} min read`}
            </p>
          </header>

          {/* The post's markdown is rendered by the strict in-repo renderer
              (`src/lib/markdown.ts`), which escapes all HTML in the source. */}
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
        </article>
      </div>
    </>
  );
}
