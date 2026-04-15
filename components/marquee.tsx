"use client"

export function Marquee() {
  const items = [
    "12\" Records",
    "7\" Records",
    "150g Standard",
    "180g Heavy",
    "Colored Vinyl",
    "Center Labels",
    "Custom Packaging",
    "Audio Mastering",
    "Lacquer Cutting",
    "Electroplating",
    "Graphic Design",
    "New Orleans",
  ]

  return (
    <div className="fixed top-[52px] left-0 right-0 z-40 py-3 bg-[#141414] border-y border-[#2a2a2a] overflow-hidden">
      <div className="flex animate-marquee whitespace-nowrap">
        {[...items, ...items, ...items].map((item, index) => (
          <span
            key={index}
            className="mx-8 text-sm font-bold uppercase tracking-widest text-primary"
          >
            {item} <span className="mx-4 opacity-50">•</span>
          </span>
        ))}
      </div>
    </div>
  )
}
