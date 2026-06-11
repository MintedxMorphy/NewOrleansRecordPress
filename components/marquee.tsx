"use client"

export function Marquee() {
  const pelletYellow = "#F4C400"
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

  const renderItems = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center whitespace-nowrap">
      {items.map((item) => (
        <span
          key={`${keyPrefix}-${item}`}
          className="mx-10 inline-flex items-center gap-8 text-[30px] font-bold uppercase leading-none tracking-[0.18em] text-primary lg:text-[34px]"
        >
          {item}
          <span
            aria-hidden="true"
            className="inline-flex translate-y-[-1px] items-center text-[18px] font-black leading-none lg:text-[20px]"
            style={{ color: pelletYellow }}
          >
            ⚡
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="fixed top-[80px] md:top-[100px] left-0 right-0 z-40 py-5 bg-[#141414] border-y border-[#2a2a2a] overflow-hidden">
      <div className="flex w-max animate-marquee whitespace-nowrap">
        {renderItems("primary")}
        <div aria-hidden="true" className="flex shrink-0">
          {renderItems("duplicate")}
        </div>
      </div>
    </div>
  )
}
