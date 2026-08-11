"use client"

import { useState } from "react"
import { Reveal } from "./reveal"

const ACCENT = "#2779a7"
const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

export function Contact() {
  const [sent, setSent] = useState(false)

  const inputClass =
    "w-full border-0 border-b border-black/20 bg-transparent py-4 text-lg text-[#141414] placeholder:text-black/40 focus:border-black focus:outline-none transition-colors"

  return (
    <section id="contact" className="bg-[#f4f4f4] py-28 lg:py-40">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="grid gap-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <Reveal>
              <p
                className="mb-8 text-[13px] font-semibold uppercase tracking-[0.35em]"
                style={{ color: ACCENT }}
              >
                Let&apos;s talk
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h2
                className="text-[2.6rem] font-bold leading-[1.02] tracking-[-0.02em] text-[#141414] sm:text-6xl lg:text-7xl"
                style={{ fontFamily: DISPLAY }}
              >
                Start your
                <br />
                vinyl project<span style={{ color: ACCENT }}>.</span>
              </h2>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-8 max-w-md text-lg leading-relaxed text-black/55">
                If you don&apos;t see exactly what you want, reach out so we can
                assist you. Contact us for special projects &mdash; long live analog!
              </p>
            </Reveal>

            <Reveal delay={160}>
              <div className="mt-14 space-y-8">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-black/40">Email</p>
                  <a
                    href="mailto:info@neworleansrecordpress.com"
                    className="mt-2 block text-xl text-[#141414] transition-colors hover:text-black/60"
                    style={{ fontFamily: DISPLAY }}
                  >
                    info@neworleansrecordpress.com
                  </a>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-black/40">Phone</p>
                  <a
                    href="tel:504-975-6569"
                    className="mt-2 block text-xl text-[#141414] transition-colors hover:text-black/60"
                    style={{ fontFamily: DISPLAY }}
                  >
                    504-975-6569
                  </a>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.25em] text-black/40">Location</p>
                  <p className="mt-2 text-xl text-[#141414]" style={{ fontFamily: DISPLAY }}>
                    New Orleans, Louisiana
                  </p>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120}>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setSent(true)
              }}
              className="flex flex-col gap-8"
            >
              <input className={inputClass} placeholder="Full name" required />
              <input className={inputClass} type="email" placeholder="Email address" required />
              <input className={inputClass} placeholder="Label / band name" />
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                placeholder="Tell us about your project"
              />
              {sent ? (
                <p className="text-base" style={{ color: ACCENT }}>
                  Thanks — this is a preview form. We&apos;ll wire it to the live inbox on launch.
                </p>
              ) : (
                <button
                  type="submit"
                  className="mt-2 inline-flex w-fit rounded-full px-10 py-4 text-sm font-semibold text-white transition-transform hover:scale-[1.03]"
                  style={{ backgroundColor: ACCENT }}
                >
                  Send request
                </button>
              )}
            </form>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
