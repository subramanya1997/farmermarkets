import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts, blogPath } from "@/lib/blog";
import { BlogCover } from "@/components/BlogCover";
import { absoluteUrl } from "@/lib/site";
import { SITE_FRAME } from "@/lib/ui";

// Same static/ISR posture as the rest of the site; posts are code, so a new
// deploy is what publishes one.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Blog - Guides to Shopping at Farmers Markets",
  description:
    "Practical guides to farmers markets: using SNAP and EBT, understanding seasons and hours, and making the most of a market visit.",
  alternates: {
    canonical: '/blog',
  },
  openGraph: {
    title: "Blog - Guides to Shopping at Farmers Markets",
    description:
      "Practical guides to farmers markets: using SNAP and EBT, understanding seasons and hours, and making the most of a market visit.",
    url: '/blog',
  },
};

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BlogIndexPage() {
  const posts = getAllPosts();

  const blogSchema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Farmer Markets Blog',
    url: absoluteUrl('/blog'),
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: absoluteUrl(blogPath(post.slug)),
      datePublished: post.publishedAt,
      ...(post.updatedAt ? { dateModified: post.updatedAt } : {}),
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }}
      />
      <div className="min-h-[calc(100vh-4rem)]">
        <section className="w-full bg-gradient-to-b from-green-50 to-white py-10 dark:from-green-900/20 dark:to-zinc-950 sm:py-14">
          <div className={SITE_FRAME}>
            <div className="mx-auto max-w-3xl">
              <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl">Blog</h1>
              <p className="mt-2 max-w-[75ch] text-zinc-600 dark:text-zinc-400 sm:text-lg">
                Practical guides to farmers markets: how to pay, when to go, and how to shop well
                once you are there.
              </p>
            </div>
          </div>
        </section>

        <section className="w-full bg-white py-8 dark:bg-zinc-900 sm:py-12">
          <div className={SITE_FRAME}>
            <ul className="mx-auto grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-green-600/40 hover:shadow-lg hover:shadow-green-900/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-500/40">
                    <div className="aspect-[1200/630] w-full">
                      <BlogCover slug={post.slug} title={post.title} theme={post.cover} />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="inline-flex items-center rounded-sm bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-800 dark:bg-green-900/40 dark:text-green-300">
                          {post.tag}
                        </span>
                        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                        {` · ${post.readingMinutes} min read`}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
                        <Link
                          href={blogPath(post.slug)}
                          className="after:absolute after:inset-0 after:content-[''] group-hover:text-green-700 dark:group-hover:text-green-400"
                        >
                          {post.title}
                        </Link>
                      </h2>
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {post.description}
                      </p>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
