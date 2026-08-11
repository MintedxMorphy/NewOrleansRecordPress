"use client"

import Image from "next/image"
import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

const releases = [
  { artist: "Lost Bayou Ramblers", album: "Live at the Orpheum", image: "/images/releases/lpo-live.png" },
  { artist: "Amanda Shaw", album: "Not A Bubble Gum Pop Princess", image: "/images/releases/amanda-shaw.png" },
  { artist: "Anders Osborne", album: "Picasso's Villa", image: "/images/releases/anders-osborne.png" },
  { artist: "Arise Roots", album: "Pathways", image: "/images/releases/arise-roots.png" },
  { artist: "Not Exotic", album: "Self-Titled Debut", image: "/images/releases/not-exotic.png" },
  { artist: "Whisper Party!", album: "Waveland", image: "/images/releases/whisper-party.png" },
  { artist: "Jenny Scheinman", album: "New Release", image: "/images/releases/jenny-scheinman.png" },
  { artist: "Ike Yard", album: "1982", image: "/images/releases/ike-yard.png" },
]

export function RecentWork() {
  return (
    <section id="work" className="bg-white py-28 lg:py-40">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Reveal>
              <p
                className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
                style={{ color: ACCENT }}
              >
                Our work
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2
                className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-[#141414] sm:text-6xl lg:text-7xl"
                style={{ fontFamily: DISPLAY }}
              >
                Pressed in
                <br />
                New Orleans<span style={{ color: ACCENT }}>.</span>
              </h2>
            </Reveal>
          </div>
          <Reveal delay={160}>
            <a
              href="https://www.instagram.com/neworleansrecordpress/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-black/60 underline-offset-4 transition-colors hover:text-black hover:underline"
            >
              More on Instagram &rarr;
            </a>
          </Reveal>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {releases.map((r, i) => (
            <Reveal key={r.artist} delay={(i % 4) * 80}>
              <a
                href="https://www.instagram.com/neworleansrecordpress/"
                target="_blank"
                rel="noopener noreferrer"
                className="group block"
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-black/5">
                  <Image
                    src={r.image}
                    alt={`${r.artist} — ${r.album}`}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <h3
                  className="mt-4 text-base font-semibold text-[#141414]"
                  style={{ fontFamily: DISPLAY }}
                >
                  {r.artist}
                </h3>
                <p className="mt-1 text-sm text-black/45">{r.album}</p>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
