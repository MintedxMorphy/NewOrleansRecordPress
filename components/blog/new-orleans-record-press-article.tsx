import Image from "next/image"
import Link from "next/link"
import type { BlogPost } from "@/lib/blog"

const linkClass =
  "text-primary underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors"

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(`${iso}T12:00:00`))
}

export function NewOrleansRecordPressArticle({ post }: { post: BlogPost }) {
  return (
    <article className="mx-auto max-w-3xl px-6 lg:px-10">
      <header className="mb-10">
        <p className="mb-6 text-[13px] font-semibold uppercase tracking-[0.35em] text-primary">
          <Link href="/blog" className="hover:text-primary/80">
            NORP Blog
          </Link>
        </p>
        <h1 className="text-[2.15rem] font-bold leading-[1.08] tracking-[-0.02em] text-foreground sm:text-5xl">
          {post.title}
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
          Independently owned vinyl manufacturing in New Orleans — artwork specs,
          the people who run the plant, and answers to the questions we hear most.
        </p>
        <time
          className="mt-4 block text-sm text-muted-foreground"
          dateTime={post.datePublished}
        >
          {formatDate(post.datePublished)}
        </time>
      </header>

      <figure className="mb-12 overflow-hidden rounded-2xl bg-black">
        <Image
          src={post.heroImage.src}
          alt={post.heroImage.alt}
          width={post.heroImage.width}
          height={post.heroImage.height}
          className="h-auto w-full"
          priority
        />
        <figcaption className="bg-card px-4 py-3 text-sm text-muted-foreground">
          Test pressings from New Orleans Record Press — splatter, gold, and marble vinyl.
        </figcaption>
      </figure>

      <div className="space-y-6 text-lg leading-relaxed text-foreground/85">
        <p>
          <a href="https://www.nolavinyl.com" className={linkClass}>
            New Orleans Record Press
          </a>{" "}
          is the city&apos;s first and only independently owned vinyl record
          manufacturing plant, founded in 2016. From 12&quot; and 7&quot; pressings
          to packaging, the work happens in New Orleans — for artists, labels, and
          anyone ready to put music on wax.
        </p>
        <p>
          Planning a project? Start on the{" "}
          <a href="https://www.nolavinyl.com" className={linkClass}>
            NORP homepage
          </a>
          , get an instant estimate with the{" "}
          <Link href="/quote" className={linkClass}>
            Quote Calculator
          </Link>
          , or{" "}
          <Link href="/#contact" className={linkClass}>
            get in touch
          </Link>
          . Artwork templates live on our{" "}
          <Link href="/resources" className={linkClass}>
            Resources
          </Link>{" "}
          page.
        </p>
      </div>

      <section className="mt-16" aria-labelledby="artwork-heading">
        <h2
          id="artwork-heading"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          Artwork: templates, files, and fees
        </h2>
        <div className="mt-6 space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            NORP requires artwork submitted through our pre-approved templates.
            Templates are available for 12&quot; and 7&quot; center labels, jackets,
            gatefolds, inner sleeves, inserts, and marketing stickers. Download them
            from the{" "}
            <Link href="/resources#templates" className={linkClass}>
              templates section
            </Link>{" "}
            on Resources.
          </p>
          <p>
            Submit unflattened, layered Photoshop, Illustrator, or PDF files at
            300–600 DPI, with fonts converted to shapes. Flattened rasterized files
            (JPEG, PNG, TIFF, GIF) are not accepted.
          </p>
          <p>
            A $50 re-proofing fee applies for corrections after files are submitted.
            Artwork that doesn&apos;t follow the templates is subject to a $50/hour
            design fee, with a one-hour minimum.
          </p>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="team-heading">
        <h2
          id="team-heading"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          The Team Behind Every Groove
        </h2>
        <div className="mt-6 space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            NORP is run by a hands-on team. Meet everyone on the{" "}
            <Link href="/team" className={linkClass}>
              team page
            </Link>
            .
          </p>
          <ul className="space-y-3 border-l-2 border-primary/30 pl-6">
            <li>
              <strong className="text-foreground">Gregory Gremillion</strong>
              <span className="text-muted-foreground">
                {" "}
                — Partner, Strategy, Tech &amp; Partnerships
              </span>
            </li>
            <li>
              <strong className="text-foreground">Scott Borne</strong>
              <span className="text-muted-foreground">
                {" "}
                — Partner, Artist &amp; Label Relations, Sales
              </span>
            </li>
            <li>
              <strong className="text-foreground">Brice White</strong>
              <span className="text-muted-foreground">
                {" "}
                — Partner, Press Operations &amp; Shipping
              </span>
            </li>
            <li>
              <strong className="text-foreground">Patrick Bailey</strong>
              <span className="text-muted-foreground">
                {" "}
                — Production Manager, Production &amp; Graphic Design
              </span>
            </li>
            <li>
              <strong className="text-foreground">Sarah Taylor</strong>
              <span className="text-muted-foreground">
                {" "}
                — Quality Control Director
              </span>
            </li>
          </ul>
          <p>
            A dedicated press and QC crew includes Stormy Bumfield, Blake Quick,
            Jennifer Dante, and August Cullaro, with Vincent Harvey overseeing
            sustainability and recycling.
          </p>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="pressed-heading">
        <h2
          id="pressed-heading"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          Pressed in New Orleans
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-foreground/85">
          NORP has pressed records for artists and labels including Lost Bayou
          Ramblers, Amanda Shaw, Anders Osborne, Arise Roots, Jenny Scheinman,
          Whisper Party!, and Ike Yard — spanning genres from Louisiana roots music
          to reggae to experimental.
        </p>
      </section>

      <section className="mt-16" aria-labelledby="faq-heading">
        <h2
          id="faq-heading"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          FAQ
        </h2>
        <div className="mt-8 divide-y divide-border border-y border-border">
          {post.faqs.map((faq) => (
            <div key={faq.question} className="py-6">
              <h3 className="text-xl font-bold text-foreground">{faq.question}</h3>
              <FaqAnswer question={faq.question} answer={faq.answer} />
            </div>
          ))}
        </div>
      </section>

      <aside className="mt-16 rounded-2xl bg-card px-6 py-10 text-center sm:px-10">
        <h2 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
          Ready to press?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground leading-relaxed">
          Use the Quote Calculator for an instant itemized quote, or contact the
          NORP team in New Orleans.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/quote"
            className="inline-flex rounded-full bg-primary px-8 py-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground transition-transform hover:scale-[1.03]"
          >
            Quote Calculator
          </Link>
          <Link
            href="/#contact"
            className="inline-flex rounded-full border border-border px-8 py-4 text-sm font-semibold uppercase tracking-wider text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Contact NORP
          </Link>
        </div>
      </aside>
    </article>
  )
}

function FaqAnswer({ question, answer }: { question: string; answer: string }) {
  if (question.includes("colored vinyl")) {
    return (
      <p className="mt-3 text-lg leading-relaxed text-foreground/85">
        Yes — NORP offers 150+ colors plus solid, translucent, marble, smoke, and
        splatter finishes. A &quot;Random Color Special&quot; option costs the same
        as standard black. Browse the{" "}
        <Link href="/vinyl-colors" className={linkClass}>
          vinyl color options
        </Link>
        .
      </p>
    )
  }

  if (question.includes("CD or cassette")) {
    return (
      <p className="mt-3 text-lg leading-relaxed text-foreground/85">
        Yes, as an add-on to vinyl pressing — full-service CD and cassette tape
        production and bundling is available. Use NORP&apos;s{" "}
        <a href="https://www.nolavinyl.com/quote" className={linkClass}>
          Quote Calculator
        </a>{" "}
        for an instant itemized quote.
      </p>
    )
  }

  if (question.includes("located")) {
    return (
      <p className="mt-3 text-lg leading-relaxed text-foreground/85">
        New Orleans, Louisiana. Contact:{" "}
        <a href="mailto:info@neworleansrecordpress.com" className={linkClass}>
          info@neworleansrecordpress.com
        </a>
        ,{" "}
        <a href="tel:504-975-6569" className={linkClass}>
          504-975-6569
        </a>
        .{" "}
        <Link href="/#contact" className={linkClass}>
          Reach the team
        </Link>
        .
      </p>
    )
  }

  return (
    <p className="mt-3 text-lg leading-relaxed text-foreground/85">{answer}</p>
  )
}
