"use client"

import Image from "next/image"
import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

const SUPABASE_URL =
  "https://ihqnczpjjtvtjdtwwzre.supabase.co/storage/v1/object/public/Vinyl-Colors/record-images"

const swatches = [
  { name: "Mardi Gras", image: "Mardi-Gras-Splatter-Mock-new-copy.jpg" },
  { name: "Gold", image: "NORP-Gold-new2-copy.jpg" },
  { name: "Purple Rain", image: "Vinyl-Mock-purple-rain-new-copy.jpg" },
  { name: "Miami Vice", image: "Vinyl-Mock-Pink-Purple-Smoke-new-copy.jpg" },
  { name: "Gotham Marble", image: "Vinyl-Mock-Black-White-Marble-new-copy.jpg" },
  { name: "Slimer", image: "Vinyl-Mock-slimer-new-copy.jpg" },
]

export function VinylColors() {
  return (
    <section id="colors" className="bg-[#f4f4f4] py-28 lg:py-40">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <Reveal>
              <p
                className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
                style={{ color: ACCENT }}
              >
                Express yourself
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2
                className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-[#141414] sm:text-6xl lg:text-7xl"
                style={{ fontFamily: DISPLAY }}
              >
                150+ colors.
                <br />
                <span className="text-black/35">No two alike.</span>
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-10 max-w-md text-lg leading-relaxed text-black/55">
                Unique colored vinyl and splatter options to make a release that
                looks as distinctive as it sounds.
              </p>
            </Reveal>
            <Reveal delay={200}>
              <div className="mt-8 max-w-md border-l-2 pl-5" style={{ borderColor: ACCENT }}>
                <p className="text-base leading-relaxed text-black/65">
                  Want color but watching the budget? Let us randomly choose a vinyl
                  color for your project &mdash; and get it for the same price as
                  black.
                </p>
              </div>
            </Reveal>
            <Reveal delay={240}>
              <a
                href="/vinyl-colors"
                className="mt-10 inline-flex rounded-full px-8 py-4 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
                style={{ backgroundColor: ACCENT }}
              >
                View our vinyl colors
              </a>
            </Reveal>
          </div>

          <div className="grid grid-cols-3 gap-4 sm:gap-6">
            {swatches.map((s, i) => (
              <Reveal key={s.name} delay={(i % 3) * 80} from={i % 2 === 0 ? "up" : "down"}>
                <div className="group">
                  <div className="relative aspect-square overflow-hidden rounded-full bg-white shadow-sm">
                    <Image
                      src={`${SUPABASE_URL}/${s.image}`}
                      alt={s.name}
                      fill
                      sizes="(max-width: 640px) 33vw, 18vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  </div>
                  <p className="mt-3 text-center text-xs uppercase tracking-widest text-black/50">
                    {s.name}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
