"use client"

import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

const reasons = [
  {
    title: "Independently owned",
    body: "A full-service, independently owned and operated vinyl manufacturing plant, founded in 2016.",
  },
  {
    title: "Audiophile grade",
    body: "We specialize in audiophile-grade record pressing and production \u2014 world-class quality for projects of all sizes.",
  },
  {
    title: "A genuine human touch",
    body: "We pride ourselves on providing a genuine human touch in an ever-increasing world of automation.",
  },
  {
    title: "Shipping, sorted",
    body: "Simple, affordable, customizable shipping so your records arrive uncompromised \u2014 where you need them, when you need them.",
  },
]

export function WhyChoose() {
  return (
    <section id="why" className="bg-white py-28 lg:py-40">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal>
          <p
            className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
            style={{ color: ACCENT }}
          >
            Why choose us
          </p>
        </Reveal>
        <Reveal delay={80}>
          <h2
            className="max-w-4xl text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-[#141414] sm:text-6xl lg:text-7xl"
            style={{ fontFamily: DISPLAY }}
          >
            World-class vinyl,
            <br />
            for projects of
            <br />
            <span className="text-black/35">all sizes.</span>
          </h2>
        </Reveal>

        <div className="mt-20 grid gap-x-16 gap-y-14 sm:grid-cols-2">
          {reasons.map((r, i) => (
            <Reveal key={r.title} delay={(i % 2) * 100}>
              <div className="border-t border-black/15 pt-6">
                <h3
                  className="text-2xl font-bold text-[#141414]"
                  style={{ fontFamily: DISPLAY }}
                >
                  {r.title}
                </h3>
                <p className="mt-4 max-w-md text-base leading-relaxed text-black/55">
                  {r.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
