import Link from "next/link";
import type { Metadata } from "next";
import { getAllPosts, blogPath, type BlogPost } from "@/lib/blog";
import { BlogCover } from "@/components/BlogCover";
import { BlogPhotoImage } from "@/components/BlogPhotoImage";
import { absoluteUrl } from "@/lib/site";
import { SITE_FRAME } from "@/lib/ui";
import { displaySerif } from "@/lib/fonts";
import { NewsletterSignup } from "@/components/NewsletterSignup";

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

// Rounded photo box whose image eases in on card hover.
const IMAGE_FRAME =
  'aspect-[1200/630] w-full overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800 [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-[1.03]';

// Stretches the title link over the whole card so image and text both click through.
const COVER_LINK =
  "after:absolute after:inset-0 after:content-[''] transition-colors group-hover:text-green-700 dark:group-hover:text-green-400";

function PostImage({ post, sizes, priority = false }: { post: BlogPost; sizes: string; priority?: boolean }) {
  return post.photo ? (
    <BlogPhotoImage photo={post.photo} sizes={sizes} priority={priority} />
  ) : (
    <BlogCover slug={post.slug} title={post.title} theme={post.cover} />
  );
}

function PostMeta({ post, className = '' }: { post: BlogPost; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
      <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{post.readingMinutes} min read</span>
    </p>
  );
}

export default function BlogIndexPage() {
  const posts = getAllPosts();
  const [latest, ...rest] = posts;

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
      <div className="min-h-[calc(100vh-4rem)] bg-white dark:bg-zinc-950">
        {/* Masthead */}
        <header className="border-b border-zinc-200/80 dark:border-zinc-800">
          <div className={`${SITE_FRAME} py-12 sm:py-16 lg:py-20`}>
            <div className="mx-auto max-w-6xl">
              <h1
                className={`${displaySerif.className} max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl lg:text-6xl`}
              >
                Guides for market day
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
                How to pay, when to go, what is in season, and how to keep what you bring home
                fresh.
              </p>
            </div>
          </div>
        </header>

        {latest && (
          <section aria-label="Latest guide" className={`${SITE_FRAME} pt-10 sm:pt-14`}>
            <article className="group relative mx-auto grid max-w-6xl items-center gap-6 lg:grid-cols-12 lg:gap-12">
              <div className={`${IMAGE_FRAME} lg:col-span-7`}>
                <PostImage post={latest} sizes="(min-width: 1152px) 660px, (min-width: 1024px) 58vw, 100vw" priority />
              </div>
              <div className="lg:col-span-5">
                <h2
                  className={`${displaySerif.className} text-3xl font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl`}
                >
                  <Link href={blogPath(latest.slug)} className={COVER_LINK}>
                    {latest.title}
                  </Link>
                </h2>
                <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-lg">
                  {latest.description}
                </p>
                <PostMeta post={latest} className="mt-5" />
                <p aria-hidden="true" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-green-400">
                  Read the guide
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </p>
              </div>
            </article>
          </section>
        )}

        {rest.length > 0 && (
          <section aria-labelledby="more-guides" className={`${SITE_FRAME} py-14 sm:py-20`}>
            <div className="mx-auto max-w-6xl">
              <div className="flex items-center gap-4">
                <h2
                  id="more-guides"
                  className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400"
                >
                  More guides
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
                  <li key={post.slug}>
                    <article className="group relative flex h-full flex-col">
                      <div className={IMAGE_FRAME}>
                        <PostImage post={post} sizes="(min-width: 1152px) 360px, (min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" />
                      </div>
                      <h3
                        className={`${displaySerif.className} mt-5 text-xl font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50`}
                      >
                        <Link href={blogPath(post.slug)} className={COVER_LINK}>
                          {post.title}
                        </Link>
                      </h3>
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {post.description}
                      </p>
                      <PostMeta post={post} className="mt-4" />
                    </article>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className={`${SITE_FRAME} pb-16 sm:pb-24`}>
          <div className="mx-auto max-w-6xl">
            <NewsletterSignup source="blog_index" variant="band" />
          </div>
        </section>
      </div>
    </>
  );
}
