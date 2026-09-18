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

export function FinebiltPressArticle({ post }: { post: BlogPost }) {
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
          How New Orleans Record Press uses a vintage Finebilt machine for
          one-of-a-kind specialty vinyl.
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
          FINEBILT LOS ANGELES nameplate on NORP&apos;s vintage press, with the
          green hand lever.
        </figcaption>
      </figure>

      <div className="space-y-6 text-lg leading-relaxed text-foreground/85">
        <p>
          Most modern pressing plants run everything through the same automated
          line.{" "}
          <a href="https://www.nolavinyl.com" className={linkClass}>
            New Orleans Record Press
          </a>{" "}
          does that too — for standard colors, our modern Viryl WarmTone press
          handles high-volume, consistent-color runs efficiently. But for
          artists and labels chasing something rarer, we still run a vintage
          Finebilt press: an older, hand-operated machine built for exactly the
          kind of unpredictable, artisan pressing that automated lines can&apos;t
          replicate.
        </p>
        <p>
          Planning a specialty color run? Start with the{" "}
          <Link href="/quote" className={linkClass}>
            Quote Calculator
          </Link>
          , browse{" "}
          <Link href="/vinyl-colors" className={linkClass}>
            vinyl colors
          </Link>
          , or{" "}
          <Link href="/#contact" className={linkClass}>
            get in touch
          </Link>
          .
        </p>
      </div>

      <section className="mt-16" aria-labelledby="what-is-finebilt">
        <h2
          id="what-is-finebilt"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          What Is a Finebilt Press?
        </h2>
        <div className="mt-6 space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            A Finebilt press is a vintage-style vinyl record press, hand-loaded
            and hand-operated rather than run through a fully automated cycle. At
            NORP, the Finebilt is dedicated to our specialty color work:
            splatter, glitter, eco-mix, and marble effects, pressed at a heavier
            190–200 gram weight for extra heft and durability.
          </p>
        </div>
        <figure className="mt-10 overflow-hidden rounded-2xl bg-black">
          <Image
            src="/blog/norp-finebilt-open-moulds.jpg"
            alt="Open Finebilt moulds at New Orleans Record Press — chrome record faces and hoses on the shop floor"
            width={577}
            height={1024}
            className="h-auto w-full"
          />
          <figcaption className="bg-card px-4 py-3 text-sm text-muted-foreground">
            Open Finebilt moulds at New Orleans Record Press — chrome record
            faces and hoses on the shop floor.
          </figcaption>
        </figure>
      </section>

      <section className="mt-16" aria-labelledby="hand-pressing">
        <h2
          id="hand-pressing"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          Why Hand-Pressing Changes Everything
        </h2>
        <div className="mt-6 space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            On an automated line, every record in a run is engineered to look
            identical. On the Finebilt, a press operator hand-loads each
            individual &quot;biscuit&quot; of colored PVC compound before every
            press cycle — which means every single splatter, marble, or glitter
            record that comes off this machine is genuinely one-of-a-kind. No
            two splatter patterns land the same way twice.
          </p>
          <p>
            That&apos;s not a limitation — it&apos;s the point. For labels and
            artists who want a variant that feels like a real collectible rather
            than a mass-produced object, hand-pressed splatter vinyl delivers
            something a fully automated press structurally cannot: true
            uniqueness, record to record.
          </p>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="combinations">
        <h2
          id="combinations"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          Endless Creative Combinations
        </h2>
        <div className="mt-6 space-y-6 text-lg leading-relaxed text-foreground/85">
          <p>
            Because color compound is hand-mixed and hand-loaded before each
            press, the creative possibilities are close to unlimited:
          </p>
          <ul className="space-y-3 border-l-2 border-primary/30 pl-6">
            <li>
              <strong className="text-foreground">Splatter</strong>
              <span className="text-muted-foreground">
                {" "}
                — multiple colors splattered across a base color in
                unpredictable patterns
              </span>
            </li>
            <li>
              <strong className="text-foreground">Marble</strong>
              <span className="text-muted-foreground">
                {" "}
                — swirled, blended color effects
              </span>
            </li>
            <li>
              <strong className="text-foreground">Glitter</strong>
              <span className="text-muted-foreground">
                {" "}
                — metallic fleck mixed directly into the vinyl compound
              </span>
            </li>
            <li>
              <strong className="text-foreground">Eco-mix</strong>
              <span className="text-muted-foreground">
                {" "}
                — recycled/repurposed vinyl scrap blended into new pressings,
                giving each record a unique mottled look while cutting down on
                waste
              </span>
            </li>
          </ul>
          <p>
            Any of these can be built around a label&apos;s or artist&apos;s
            specific color palette — there&apos;s no fixed &quot;menu,&quot;
            just a starting point for a conversation about what a release should
            look like. See{" "}
            <Link href="/vinyl-colors" className={linkClass}>
              vinyl color options
            </Link>{" "}
            or request a specialty finish in the{" "}
            <Link href="/quote" className={linkClass}>
              Quote Calculator
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mt-16" aria-labelledby="collectible">
        <h2
          id="collectible"
          className="text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
        >
          Built for Collectible, Limited-Run Releases
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-foreground/85">
          Because each record is hand-pressed, Finebilt runs are naturally
          suited to limited editions, test pressings, and specialty variants
          rather than high-volume runs — exactly where collectors and superfans
          are paying the closest attention to what a record looks like, not just
          what it sounds like.
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
  if (question.includes("order splatter")) {
    return (
      <p className="mt-3 text-lg leading-relaxed text-foreground/85">
        Yes — splatter, marble, and other specialty finishes are available
        options in NORP&apos;s{" "}
        <a href="https://www.nolavinyl.com/quote" className={linkClass}>
          Quote Calculator
        </a>{" "}
        alongside solid and translucent colors. Browse{" "}
        <Link href="/vinyl-colors" className={linkClass}>
          vinyl colors
        </Link>
        .
      </p>
    )
  }

  return (
    <p className="mt-3 text-lg leading-relaxed text-foreground/85">{answer}</p>
  )
}
