"use client"

import Image from "next/image"

const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-white py-16">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10">
        <div className="flex flex-col gap-10 border-b border-black/10 pb-12 sm:flex-row sm:items-start sm:justify-between">
          <Image
            src="/images/norp-logo-white-transparent.png"
            alt="New Orleans Record Press"
            width={774}
            height={291}
            className="h-16 w-auto"
            style={{ filter: "invert(1)" }}
          />
          <div className="flex gap-12">
            <div className="flex flex-col gap-3">
              <a href="#manufacturing" className="text-sm text-black/55 hover:text-black">Services</a>
              <a href="/vinyl-colors" className="text-sm text-black/55 hover:text-black">Vinyl Colors</a>
              <a href="/quote" className="text-sm text-black/55 hover:text-black">Quote Calculator</a>
            </div>
            <div className="flex flex-col gap-3">
              <a href="/resources" className="text-sm text-black/55 hover:text-black">Resources</a>
              <a href="/team" className="text-sm text-black/55 hover:text-black">Team</a>
              <a
                href="https://www.instagram.com/neworleansrecordpress/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-black/55 hover:text-black"
              >
                Instagram
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-black/40">
            &copy; {new Date().getFullYear()} New Orleans Record Press. All rights reserved.
          </p>
          <p className="text-xs text-black/40" style={{ fontFamily: DISPLAY }}>
            Made with love in NOLA
          </p>
        </div>
      </div>
    </footer>
  )
}
