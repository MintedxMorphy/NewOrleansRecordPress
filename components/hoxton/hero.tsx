"use client"

import Image from "next/image"
import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-white"
    >
      <div className="mx-auto grid w-full max-w-[1400px] items-center gap-12 px-6 pt-40 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-10 lg:pt-44">
        <div>
          <Reveal from="up">
            <p
              className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
              style={{ color: ACCENT }}
            >
              New Orleans · Est. 2016
            </p>
          </Reveal>

          <h1
            className="text-[2.15rem] font-bold leading-[1.03] tracking-[-0.02em] text-[#141414] sm:text-5xl lg:text-[4.4rem]"
            style={{ fontFamily: DISPLAY }}
          >
            <Reveal from="up" delay={80} as="span">
              <span className="block">Timeless Analog</span>
            </Reveal>
            <Reveal from="up" delay={160} as="span">
              <span className="block">Craftsmanship</span>
            </Reveal>
            <Reveal from="up" delay={240} as="span">
              <span className="block">from the Heart of</span>
            </Reveal>
            <Reveal from="up" delay={320} as="span">
              <span className="block">
                New Orleans<span style={{ color: ACCENT }}>.</span>
              </span>
            </Reveal>
          </h1>

          <Reveal from="up" delay={420}>
            <p className="mt-10 max-w-xl text-lg leading-relaxed text-black/60">
              The New Orleans Record Press is a full-service, independently owned and
              operated vinyl record manufacturing plant. We specialize in
              audiophile-grade record pressing and production, with commercial CD and
              cassette tape bundling.
            </p>
          </Reveal>

          <Reveal from="up" delay={520}>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <a
                href="#contact"
                className="rounded-full px-8 py-4 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
                style={{ backgroundColor: ACCENT }}
              >
                Get in touch
              </a>
              <a
                href="/vinyl-colors"
                className="rounded-full border border-black/20 px-8 py-4 text-sm font-semibold text-[#141414] transition-colors hover:border-black hover:bg-black/5"
              >
                View our vinyl colors
              </a>
            </div>
          </Reveal>
        </div>

        <Reveal from="up" delay={300}>
          <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-black/5">
            <Image
              src="/images/norp-boxes-hero.png"
              alt="New Orleans Record Press branded shipping boxes, 1336 Montegut St."
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover object-center"
            />
          </div>
        </Reveal>
      </div>

      <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex">
        <span className="text-[11px] uppercase tracking-[0.3em] text-black/40">Scroll</span>
        <span className="h-10 w-px animate-pulse bg-black/30" />
      </div>
    </section>
  )
}
