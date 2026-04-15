"use client"

import Image from "next/image"
import { useState, useEffect } from "react"
import useSWR from "swr"

interface Release {
  id: string
  artist: string
  album: string
  image_url: string
  link: string | null
}

// Fallback releases for when database is empty or loading
const fallbackReleases: Release[] = [
  {
    id: "1",
    artist: "Louisiana Philharmonic Orchestra & Lost Bayou Ramblers",
    album: "Live at Orpheum Theater NOLA",
    image_url: "/images/releases/lpo-live.png",
    link: null,
  },
  {
    id: "2",
    artist: "Amanda Shaw",
    album: "I'm Not A Bubble Gum Pop Princess (2024 Edition)",
    image_url: "/images/releases/amanda-shaw.png",
    link: null,
  },
  {
    id: "3",
    artist: "Arise Roots",
    album: "Pathways",
    image_url: "/images/releases/arise-roots.png",
    link: null,
  },
  {
    id: "4",
    artist: "Anders Osborne",
    album: "Picasso's Villa",
    image_url: "/images/releases/anders-osborne.png",
    link: null,
  },
  {
    id: "5",
    artist: "Not Exotic",
    album: "Self-Titled Debut LP",
    image_url: "/images/releases/not-exotic.png",
    link: null,
  },
  {
    id: "6",
    artist: "Mccloud",
    album: "Look Behind You EP",
    image_url: "/images/releases/mccloud.png",
    link: null,
  },
  {
    id: "7",
    artist: "Whisper Party!",
    album: "Waveland",
    image_url: "/images/releases/whisper-party.png",
    link: null,
  },
  {
    id: "8",
    artist: "Jenny Scheinman",
    album: "New Release",
    image_url: "/images/releases/jenny-scheinman.png",
    link: null,
  },
  {
    id: "9",
    artist: "Ike Yard",
    album: "1982",
    image_url: "/images/releases/ike-yard.png",
    link: null,
  },
  {
    id: "10",
    artist: "Troy Sawyer and The Elementz",
    album: "Rock Your Soul",
    image_url: "/images/releases/troy-sawyer.png",
    link: null,
  },
]

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function RecentWork() {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const { data, error } = useSWR('/api/releases', fetcher)
  
  // Use database releases if available, otherwise fallback
  const releases: Release[] = data?.releases?.length > 0 
    ? data.releases 
    : fallbackReleases

  return (
    <section id="recent-work" className="py-24 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-primary font-mono text-sm uppercase tracking-[0.3em] mb-3">
              From the Press
            </p>
            <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight">
              Recent Work
            </h2>
          </div>
          <a
            href="https://www.instagram.com/neworleansrecordpress/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
          >
            View All on Instagram
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
          {releases.map((release) => (
            <a
              key={release.id}
              href={release.link || "https://www.instagram.com/neworleansrecordpress/"}
              target="_blank"
              rel="noopener noreferrer"
              className="group block"
              onMouseEnter={() => setHoveredId(release.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Square Image Container */}
              <div className="relative aspect-square overflow-hidden bg-secondary mb-3">
                <Image
                  src={release.image_url}
                  alt={`${release.artist} - ${release.album}`}
                  fill
                  className={`object-cover transition-transform duration-500 ${
                    hoveredId === release.id ? "scale-110" : "scale-100"
                  }`}
                />
                {/* Hover Overlay */}
                <div
                  className={`absolute inset-0 bg-primary/20 transition-opacity duration-300 ${
                    hoveredId === release.id ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>

              {/* Text */}
              <h3 className="text-sm font-bold uppercase tracking-wide text-foreground group-hover:text-primary transition-colors leading-tight">
                {release.artist}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-tight">
                {release.album}
              </p>
            </a>
          ))}
        </div>

        {/* Mobile Link */}
        <div className="mt-8 md:hidden text-center">
          <a
            href="https://www.instagram.com/neworleansrecordpress/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-primary"
          >
            View All on Instagram
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z"
                clipRule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
