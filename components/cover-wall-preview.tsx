"use client"

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react"

type CoverRelease = {
  id: string
  artist: string
  title: string
  matrix?: string
  quantity?: number
  colors?: string[]
  label?: string
  year?: string
  coverUrl?: string
  sourceUrl?: string
  score: number
  accent?: string
  tile: "hero" | "feature" | "standard"
}

export type CoverCatalog = {
  generatedAt: string
  source: string
  stats: {
    totalJobs?: number
    uniqueReleases: number
    withArtwork: number
    artworkPending: number
  }
  releases: CoverRelease[]
}

const DISPLAY = "var(--font-preview-display), system-ui, sans-serif"
const ACCENT = "#2779a7"

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0"
}

function TypographicCover({ release }: { release: CoverRelease }) {
  return (
    <div
      className="absolute inset-0 flex flex-col justify-between overflow-hidden p-4 text-white"
      style={{
        background:
          `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.28), transparent 28%), linear-gradient(135deg, ${release.accent || ACCENT}, #141414 72%)`,
      }}
    >
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
        <span>{release.label || "NORP"}</span>
        <span>{release.matrix || ""}</span>
      </div>
      <div>
        <p className="line-clamp-4 text-2xl font-black uppercase leading-[0.9] tracking-[-0.04em] sm:text-3xl" style={{ fontFamily: DISPLAY }}>
          {release.artist}
        </p>
        <p className="mt-3 line-clamp-2 text-xs font-medium uppercase tracking-[0.16em] text-white/70">
          {release.title}
        </p>
      </div>
      <div className="h-2 w-2 rounded-full bg-white/80" />
    </div>
  )
}

function CoverTile({
  release,
  imageFailed,
  onImageError,
}: {
  release: CoverRelease
  imageFailed: boolean
  onImageError: (id: string) => void
}) {
  const isLarge = release.tile !== "standard"
  const hasCover = Boolean(release.coverUrl) && !imageFailed

  return (
    <article
      className="group min-w-0"
      style={isLarge ? { gridColumn: "span 2" } : undefined}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-black/10">
        {hasCover ? (
          <img
            src={release.coverUrl}
            alt={`${release.artist} - ${release.title}`}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
            loading="lazy"
            onError={() => onImageError(release.id)}
          />
        ) : (
          <TypographicCover release={release} />
        )}

        <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-1 text-sm font-bold text-white" style={{ fontFamily: DISPLAY }}>
            {release.artist}
          </p>
          <p className="line-clamp-1 text-xs text-white/70">{release.title}</p>
          {release.label && <p className="mt-1 line-clamp-1 text-[10px] uppercase tracking-[0.16em] text-white/50">{release.label}</p>}
        </div>
      </div>

      {isLarge && (
        <div className="mt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold leading-tight text-[#141414]" style={{ fontFamily: DISPLAY }}>
                {release.artist}
              </h3>
              <p className="truncate text-sm text-black/50">{release.title}</p>
            </div>
            <div className="shrink-0 rounded-full bg-black/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
              {formatNumber(release.quantity)}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

export function CoverWallPreview({ catalog }: { catalog: CoverCatalog }) {
  const [query, setQuery] = useState("")
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return catalog.releases
    return catalog.releases.filter(release =>
      `${release.artist} ${release.title} ${release.label || ""} ${release.matrix || ""}`.toLowerCase().includes(normalized),
    )
  }, [catalog.releases, query])

  const displayTotal = catalog.stats.totalJobs || catalog.stats.uniqueReleases

  return (
    <section className="bg-white pb-28 pt-32 lg:pb-36 lg:pt-40">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-6 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.86fr)_minmax(280px,0.36fr)] lg:items-end">
          <div>
            <p className="mb-7 text-[13px] font-semibold uppercase tracking-[0.35em]" style={{ color: ACCENT }}>
              Cover wall preview
            </p>
            <h1
              className="max-w-5xl text-[3rem] font-black leading-[0.9] tracking-[-0.055em] text-[#141414] sm:text-7xl lg:text-8xl"
              style={{ fontFamily: DISPLAY }}
            >
              Pressed in
              <br />
              New Orleans<span style={{ color: ACCENT }}>.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-black/55">
              A dense visual comp of the NORP catalog, scored so bigger pressings, repeat customers,
              recognizable artists, and stronger label signals land in the most visible cells.
            </p>
          </div>

          <div className="rounded-3xl border border-black/10 bg-black/[0.03] p-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-3xl font-black text-[#141414]" style={{ fontFamily: DISPLAY }}>
                  {formatNumber(displayTotal)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  jobs sampled
                </p>
              </div>
              <div>
                <p className="text-3xl font-black text-[#141414]" style={{ fontFamily: DISPLAY }}>
                  {formatNumber(catalog.stats.uniqueReleases)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  releases
                </p>
              </div>
              <div>
                <p className="text-3xl font-black text-[#141414]" style={{ fontFamily: DISPLAY }}>
                  {formatNumber(catalog.stats.withArtwork)}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/45">
                  covers
                </p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="sr-only">Search artists, titles, labels, and matrix numbers</span>
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search the wall"
                className="h-12 w-full rounded-full border border-black/10 bg-white px-5 text-sm font-medium text-[#141414] outline-none transition placeholder:text-black/35 focus:border-[#2779a7] focus:ring-4 focus:ring-[#2779a7]/10"
              />
            </label>
          </div>
        </div>

        {catalog.source === "seed-preview" && (
          <div className="mt-8 rounded-2xl border border-[#2779a7]/20 bg-[#2779a7]/5 px-5 py-4 text-sm leading-6 text-black/60">
            This comp is using the checked-in preview catalog because Airtable credentials were not available in this environment.
            Run <code className="rounded bg-white px-1.5 py-0.5 text-black/70">node scripts/build-cover-catalog.mjs</code> with
            Airtable credentials to refresh it from the Completed table.
          </div>
        )}

        <div
          className="mt-12 grid auto-rows-auto grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          aria-live="polite"
        >
          {filtered.map(release => (
            <CoverTile
              key={release.id}
              release={release}
              imageFailed={failedImages.has(release.id)}
              onImageError={(id) => {
                setFailedImages(previous => {
                  const next = new Set(previous)
                  next.add(id)
                  return next
                })
              }}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-16 rounded-3xl border border-black/10 bg-black/[0.03] p-10 text-center">
            <p className="text-xl font-bold text-[#141414]" style={{ fontFamily: DISPLAY }}>No matching releases.</p>
            <p className="mt-2 text-sm text-black/50">Try another artist, title, label, or matrix.</p>
          </div>
        )}
      </div>
    </section>
  )
}
