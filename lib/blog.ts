export const SITE_URL = "https://www.nolavinyl.com"

export type BlogFaq = {
  question: string
  answer: string
}

export type BlogPost = {
  slug: string
  title: string
  description: string
  datePublished: string
  dateModified: string
  heroImage: {
    src: string
    alt: string
    width: number
    height: number
  }
  faqs: BlogFaq[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "new-orleans-record-press",
    title: "Vinyl Pressing at New Orleans Record Press",
    description:
      "How New Orleans Record Press handles custom vinyl: artwork templates and file specs, the team behind every groove, artists we've pressed, and FAQ — including MOQ, turnaround, and colored vinyl.",
    datePublished: "2026-09-18",
    dateModified: "2026-09-18",
    heroImage: {
      src: "/blog/norp-vinyl-test-pressings.jpg",
      alt: "Three New Orleans Record Press vinyl test pressings — splatter, gold, and purple marble — under the NORP wordmark",
      width: 1024,
      height: 1024,
    },
    faqs: [
      {
        question: "Where is New Orleans Record Press located?",
        answer:
          "New Orleans, Louisiana. Contact: info@neworleansrecordpress.com, 504-975-6569.",
      },
      {
        question: "What is the minimum order quantity for vinyl pressing at NORP?",
        answer: "100 units.",
      },
      {
        question: "How long does vinyl record pressing take?",
        answer:
          "Approximately 2–3 months from an approved lacquer to finished, packaged product.",
      },
      {
        question: "Can I get colored vinyl records?",
        answer:
          "Yes — NORP offers 150+ colors plus solid, translucent, marble, smoke, and splatter finishes. A Random Color Special option costs the same as standard black. See https://www.nolavinyl.com/vinyl-colors",
      },
      {
        question: "Does New Orleans Record Press offer CD or cassette manufacturing?",
        answer:
          "Yes, as an add-on to vinyl pressing — full-service CD and cassette tape production and bundling is available. Use NORP's Quote Calculator at https://www.nolavinyl.com/quote for an instant itemized quote.",
      },
      {
        question: "What audio formats does NORP need to press a record?",
        answer:
          "NORP can master and cut lacquers directly from your submitted audio files, or press from a lacquer you supply yourself.",
      },
      {
        question: "Is New Orleans Record Press independently owned?",
        answer:
          "Yes — NORP has been independently owned and operated since it was founded in 2016.",
      },
    ],
  },
]

export function getBlogPosts(): BlogPost[] {
  return BLOG_POSTS
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug)
}

export function postUrl(post: BlogPost): string {
  return `${SITE_URL}/blog/${post.slug}`
}

export function absoluteUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`
}
