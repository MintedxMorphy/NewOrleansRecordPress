import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { MarketingTheme } from "@/components/hoxton/marketing-theme"
import { Header } from "@/components/hoxton/header"
import { Footer } from "@/components/hoxton/footer"
import { JsonLd } from "@/components/blog/json-ld"
import { NewOrleansRecordPressArticle } from "@/components/blog/new-orleans-record-press-article"
import {
  SITE_URL,
  absoluteUrl,
  getBlogPost,
  getBlogPosts,
  postUrl,
  type BlogPost,
} from "@/lib/blog"

type PageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getBlogPosts().map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return {}

  const url = postUrl(post)
  const imageUrl = absoluteUrl(post.heroImage.src)
  const title = `${post.title} | New Orleans Record Press`

  return {
    title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.description,
      siteName: "New Orleans Record Press",
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified,
      images: [
        {
          url: imageUrl,
          width: post.heroImage.width,
          height: post.heroImage.height,
          alt: post.heroImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [imageUrl],
    },
  }
}

function articleJsonLd(post: BlogPost) {
  const url = postUrl(post)
  const imageUrl = absoluteUrl(post.heroImage.src)

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        image: imageUrl,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": url,
        },
        url,
        author: {
          "@type": "Organization",
          name: "New Orleans Record Press",
          url: SITE_URL,
        },
        publisher: {
          "@type": "Organization",
          name: "New Orleans Record Press",
          url: SITE_URL,
          logo: {
            "@type": "ImageObject",
            url: absoluteUrl("/images/norp-logo-white-transparent.png"),
          },
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  }
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  return (
    <MarketingTheme>
      <JsonLd data={articleJsonLd(post)} />
      <Header />
      <main className="bg-white pt-40 pb-24">
        {slug === "new-orleans-record-press" ? (
          <NewOrleansRecordPressArticle post={post} />
        ) : null}
      </main>
      <Footer />
    </MarketingTheme>
  )
}
