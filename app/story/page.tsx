import type { Metadata } from 'next'
import Link from 'next/link'
import { Header } from '@/components/header'

export const metadata: Metadata = {
  title: 'Our Story | New Orleans Record Press',
  description: 'Built in the Bywater. Obsessed with the craft. The story of New Orleans Record Press.',
}

export default function StoryPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      {/* Spacer for fixed header */}
      <div className="h-16" />

      {/* Hero block */}
      <div className="border-b border-border px-6 md:px-16 lg:px-32 py-20 md:py-32 max-w-none">
        <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary mb-6">Our Story</p>
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight text-foreground max-w-4xl">
          Built on the Bayou.<br />
          <span className="text-primary">Obsessed</span> with the Process.
        </h1>
      </div>

      {/* Body copy */}
      <div className="px-6 md:px-16 lg:px-32 py-16 md:py-24">
        <div className="space-y-12 text-xl md:text-2xl leading-relaxed max-w-4xl">

          <p>
            In a city where music is not background noise but a way of life, New Orleans Record Press was built with a simple belief: records should be made with the same care and soul that went into the music itself. Located in the historic Bywater neighborhood of New Orleans, our plant was founded by musicians, collectors, label owners, and lifelong vinyl obsessives who understood that a great pressing is not just manufacturing — it is preservation. From underground independent releases to nationally distributed records, every project that comes through our doors is treated with the same level of respect for the artist, the listener, and the craft.
          </p>

          <div className="border-l-4 border-primary pl-8 py-2">
            <p className="text-3xl md:text-4xl font-bold leading-snug text-foreground">
              "Audiophile-grade vinyl is not created by accident. It is the result of disciplined process control, critical listening, and relentless quality assurance."
            </p>
          </div>

          <p>
            At NORP, we approach vinyl pressing the way old-world engineers approached mastering studios and analog consoles: obsessively, methodically, and without compromise. Audiophile-grade vinyl is not created by accident. It is the result of disciplined process control, critical listening, meticulous visual inspection, and relentless quality assurance at every stage of production. While much of the industry has shifted toward speed and volume, we have remained committed to consistency, precision, and the tactile standards that serious collectors and discerning labels demand. Every groove matters. Every cycle matters. Every record leaving our facility carries our name on it — and we treat that responsibility accordingly.
          </p>

          <p>
            We believe the difference between an average pressing and a world-class pressing lives in the details most people never see. Flatness. Surface noise. Groove integrity. Packaging precision. Shipping protection. Communication. Follow-through. These things matter because they directly affect the listening experience and the trust artists place in us. Our team remains deeply hands-on throughout the entire process, combining modern manufacturing discipline with the old-school craftsmanship that built vinyl culture in the first place. In an era of mass production and rushed turnaround promises, NORP was built to be something increasingly rare: a pressing plant that genuinely cares.
          </p>

          <p>
            But beyond the machines and process, New Orleans Record Press exists because vinyl still means something. Records are physical artifacts of culture, memory, and artistic intention. They are meant to be held, studied, collected, and experienced with intention. That understanding shapes everything we do — from the way we communicate with clients to the way we inspect every pressing before it leaves the plant. We are not chasing trends. We are honoring a legacy. And for the artists, labels, and collectors who refuse to settle for anything less than exceptional, we intend to keep raising the standard for what modern vinyl manufacturing can be.
          </p>

        </div>

        {/* CTA */}
        <div className="mt-20 pt-12 border-t border-border flex flex-col sm:flex-row gap-4 items-start">
          <Link
            href="/#contact"
            className="px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-all inline-flex items-center gap-2 rounded-lg"
          >
            Start Your Project
          </Link>
          <Link
            href="/"
            className="px-8 py-4 border border-border text-foreground font-bold uppercase tracking-wider text-sm hover:border-primary hover:text-primary transition-all inline-flex items-center gap-2 rounded-lg"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
