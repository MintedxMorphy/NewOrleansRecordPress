export const SITE_URL = "https://www.nolavinyl.com"

export type BlogFaq = {
  question: string
  answer: string
}

export type BlogPost = {
  slug: string
  title: string
  seoTitle?: string
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
    slug: "finebilt-press",
    title: "Not Every Record Should Look the Same",
    seoTitle: "Finebilt Hand-Pressed Vinyl",
    description:
      "New Orleans Record Press still runs a vintage Finebilt press for hand-loaded splatter, glitter, eco-mix, and marble vinyl at 190–200 grams — one-of-a-kind records an automated line can't replicate.",
    datePublished: "2026-09-18",
    dateModified: "2026-09-18",
    heroImage: {
      src: "/blog/norp-finebilt-los-angeles-nameplate.jpg",
      alt: "FINEBILT LOS ANGELES nameplate on New Orleans Record Press's vintage press, with a green hand lever",
      width: 1024,
      height: 1024,
    },
    faqs: [
      {
        question: "What is a Finebilt press?",
        answer:
          "A vintage, hand-operated vinyl record press used by New Orleans Record Press for specialty color effects — splatter, glitter, eco-mix, and marble — as opposed to NORP's modern Viryl WarmTone press, which handles standard, high-volume color runs.",
      },
      {
        question: "Does New Orleans Record Press hand-press vinyl records?",
        answer:
          "Yes — specialty color runs (splatter, glitter, eco-mix, marble) are hand-loaded and pressed on NORP's vintage Finebilt press, rather than run through a fully automated line.",
      },
      {
        question: "What gram weight are Finebilt splatter records?",
        answer:
          "190–200 grams, heavier than NORP's standard 180-gram pressings.",
      },
      {
        question: "Is every splatter or marble record actually different?",
        answer:
          "Yes — because the colored PVC is hand-loaded before each press cycle on the Finebilt, splatter and marble patterns vary record to record. No two are identical.",
      },
      {
        question: "Can I order splatter, glitter, or marble vinyl at New Orleans Record Press?",
        answer:
          "Yes — splatter, marble, and other specialty finishes are available options in NORP's Quote Calculator alongside solid and translucent colors. See https://www.nolavinyl.com/quote and https://www.nolavinyl.com/vinyl-colors",
      },
    ],
  },
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
