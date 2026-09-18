import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { MarketingTheme } from "@/components/hoxton/marketing-theme"
import { Header } from "@/components/hoxton/header"
import { Footer } from "@/components/hoxton/footer"
import { JsonLd } from "@/components/blog/json-ld"
import { SITE_URL, absoluteUrl, getBlogPosts, postUrl } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/blog`
const PAGE_TITLE = "Blog | New Orleans Record Press"
const PAGE_DESCRIPTION =
  "Guides from New Orleans Record Press, the independently owned vinyl manufacturing plant in New Orleans — artwork specs, the NORP team, and pressing FAQ."

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    siteName: "New Orleans Record Press",
    images: [
      {
        url: absoluteUrl("/blog/norp-vinyl-test-pressings.jpg"),
        width: 1024,
        height: 1024,
        alt: "New Orleans Record Press vinyl test pressings",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: [absoluteUrl("/blog/norp-vinyl-test-pressings.jpg")],
  },
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(`${iso}T12:00:00`))
}

export default function BlogIndexPage() {
  const posts = getBlogPosts()
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "New Orleans Record Press Blog",
    description: PAGE_DESCRIPTION,
    url: PAGE_URL,
    publisher: {
      "@type": "Organization",
      name: "New Orleans Record Press",
      url: SITE_URL,
    },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: postUrl(post),
      datePublished: post.datePublished,
      image: absoluteUrl(post.heroImage.src),
    })),
  }

  return (
    <MarketingTheme>
      <JsonLd data={jsonLd} />
      <Header />
      <main className="bg-white pt-40 pb-24">
        <div className="mx-auto max-w-3xl px-6 lg:px-10">
          <p className="mb-6 text-[13px] font-semibold uppercase tracking-[0.35em] text-primary">
            NORP Blog
          </p>
          <h1 className="text-[2.15rem] font-bold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-5xl">
            From the press floor
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Notes and guides from{" "}
            <a
              href="https://www.nolavinyl.com"
              className="text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary"
            >
              New Orleans Record Press
            </a>
            , New Orleans&apos; independently owned vinyl manufacturing plant.
          </p>

          <ul className="mt-14 space-y-10">
            {posts.map((post) => (
              <li key={post.slug}>
                <article className="overflow-hidden rounded-2xl border border-border bg-card">
                  <Link href={`/blog/${post.slug}`} className="block overflow-hidden">
                    <Image
                      src={post.heroImage.src}
                      alt={post.heroImage.alt}
                      width={post.heroImage.width}
                      height={post.heroImage.height}
                      className="aspect-[5/4] h-auto w-full object-cover object-center"
                      priority
                    />
                  </Link>
                  <div className="px-6 py-8 sm:px-8">
                    <time
                      className="text-sm text-muted-foreground"
                      dateTime={post.datePublished}
                    >
                      {formatDate(post.datePublished)}
                    </time>
                    <h2 className="mt-3 text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="hover:text-primary transition-colors"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <p className="mt-4 leading-relaxed text-muted-foreground">
                      {post.description}
                    </p>
                    <Link
                      href={`/blog/${post.slug}`}
                      className="mt-6 inline-flex text-sm font-semibold uppercase tracking-wider text-primary hover:underline underline-offset-4"
                    >
                      Read article
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <Footer />
    </MarketingTheme>
  )
}
