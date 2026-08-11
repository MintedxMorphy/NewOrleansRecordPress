"use client"

import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

const capabilities = [
  { k: "01", title: "Pressing", body: "12\u2033 and 7\u2033 records artfully pressed in 180 gram heavyweight format." },
  { k: "02", title: "Color", body: "Unique colored vinyl and splatter options, plus center label printing." },
  { k: "03", title: "Audio", body: "Pristine audio mastering, precision lacquer cutting and the highest quality electroplating available." },
  { k: "04", title: "Packaging", body: "Various packaging styles, plus award-winning graphic design and project consulting." },
]

export function Manufacturing() {
  return (
    <section id="manufacturing" className="bg-[#f4f4f4] py-28 lg:py-40">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <Reveal>
          <p
            className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
            style={{ color: ACCENT }}
          >
            Manufacturing
          </p>
        </Reveal>

        <Reveal delay={80}>
          <h2
            className="max-w-4xl text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-[#141414] sm:text-6xl lg:text-7xl"
            style={{ fontFamily: DISPLAY }}
          >
            Artfully and
            <br />
            carefully pressed,
            <br />
            <span className="text-black/35">under one roof.</span>
          </h2>
        </Reveal>

        <Reveal delay={160}>
          <p className="mt-10 max-w-2xl text-lg leading-relaxed text-black/55">
            Our mission is to create world-class quality vinyl records for projects
            of all sizes &mdash; from runs as low as one hundred units to commercial
            pressings in the thousands. Full-service CD and cassette tape production
            is available as an add-on.
          </p>
        </Reveal>

        <div className="mt-20 grid gap-px border border-black/10 bg-black/10 sm:grid-cols-2 lg:grid-cols-4">
          {capabilities.map((cap, i) => (
            <Reveal key={cap.k} delay={i * 90}>
              <div className="h-full bg-white p-8 lg:p-10">
                <span
                  className="text-sm font-semibold tracking-widest"
                  style={{ color: ACCENT, fontFamily: DISPLAY }}
                >
                  {cap.k}
                </span>
                <h3
                  className="mt-6 text-2xl font-bold text-[#141414]"
                  style={{ fontFamily: DISPLAY }}
                >
                  {cap.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-black/55">{cap.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="mt-16 flex flex-col gap-8 border-t border-black/10 pt-10 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-x-16 gap-y-8">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-black/40">
                  Turnaround
                </p>
                <p
                  className="mt-2 text-3xl font-bold text-[#141414]"
                  style={{ fontFamily: DISPLAY }}
                >
                  ~2&ndash;3 months
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-black/40">
                  Minimum order
                </p>
                <p
                  className="mt-2 text-3xl font-bold"
                  style={{ fontFamily: DISPLAY, color: ACCENT }}
                >
                  100 units
                </p>
              </div>
            </div>
            <a
              href="#contact"
              className="text-sm font-semibold text-black/70 underline-offset-4 transition-colors hover:text-black hover:underline"
            >
              Ask about custom projects &rarr;
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
