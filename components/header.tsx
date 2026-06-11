"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/#services", label: "Services" },
  { href: "/vinyl-colors", label: "Vinyl Colors" },
  { href: "/quote", label: "Quote Calculator" },
  { href: "/team", label: "Team" },
  { href: "/#contact", label: "Contact" },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#080808] border-b border-[#2a2a2a]">
      <div className="px-6 py-4">
        {/* Desktop: 3-column grid so nav is truly centered and CTA stays right */}
        <nav className="hidden md:grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          {/* Left spacer */}
          <div />

          {/* Center: nav links */}
          <div className="flex items-center gap-4 lg:gap-5 xl:gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm lg:text-base xl:text-lg font-bold uppercase tracking-wider text-white/90 hover:text-primary transition-colors whitespace-nowrap px-2 py-3 -my-3"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right: Get a Quote always pinned here */}
          <div className="flex justify-end">
            <Link
              href="/quote"
              className="px-5 py-3 bg-primary text-primary-foreground text-sm lg:text-base xl:text-lg font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors rounded-lg whitespace-nowrap"
            >
              Get a Quote
            </Link>
          </div>
        </nav>

        {/* Mobile: hamburger + CTA side by side */}
        <div className="md:hidden flex items-center justify-between">
          <Link
            href="/quote"
            className="px-3 py-2 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors rounded-lg"
          >
            Get a Quote
          </Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-foreground hover:text-primary transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {isOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-background border-b border-border">
            <div className="flex flex-col p-6 gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="text-lg font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors py-2 border-b border-border"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
