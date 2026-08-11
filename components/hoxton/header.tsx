"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, X } from "lucide-react"

const ACCENT = "#2779a7"

const navLinks = [
  { href: "/#manufacturing", label: "Services" },
  { href: "/vinyl-colors", label: "Vinyl Colors" },
  { href: "/quote", label: "Quote Calculator" },
  { href: "/resources", label: "Resources" },
  { href: "/team", label: "Team" },
  { href: "/#contact", label: "Contact" },
]

export function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 transition-colors duration-500"
      style={{
        backgroundColor: scrolled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)",
        backdropFilter: "blur(10px)",
        borderBottom: scrolled ? "1px solid rgba(0,0,0,0.08)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-3 lg:px-10 lg:py-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/images/norp-logo-white-transparent.png"
            alt="New Orleans Record Press"
            width={774}
            height={291}
            className="h-24 w-auto lg:h-28"
            style={{ filter: "invert(1)" }}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium tracking-wide text-black/60 transition-colors hover:text-black"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/quote"
            className="rounded-full px-5 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03]"
            style={{ backgroundColor: ACCENT }}
          >
            Get a quote
          </a>
        </nav>

        <button
          className="text-black md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-black/10 bg-white/95 px-6 py-6 md:hidden">
          <div className="flex flex-col gap-5">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-lg font-medium text-black/80"
              >
                {link.label}
              </a>
            ))}
            <a
              href="/quote"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex w-fit rounded-full px-6 py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Get a quote
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
