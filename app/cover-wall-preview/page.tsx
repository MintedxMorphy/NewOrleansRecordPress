import type { Metadata } from "next"
import catalog from "@/data/cover-catalog.json"
import type { CoverCatalog } from "@/components/cover-wall-preview"
import { CoverWallPreview } from "@/components/cover-wall-preview"
import { Footer } from "@/components/hoxton/footer"
import { Header } from "@/components/hoxton/header"
import { MarketingTheme } from "@/components/hoxton/marketing-theme"

export const dynamic = "force-static"

export const metadata: Metadata = {
  title: "Cover Wall Preview | New Orleans Record Press",
  description: "Preview-only cover wall for New Orleans Record Press completed work.",
  robots: {
    index: false,
    follow: false,
  },
}

const coverCatalog = catalog as CoverCatalog

export default function CoverWallPreviewPage() {
  return (
    <MarketingTheme>
      <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-white/15 bg-black/80 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/60 backdrop-blur">
        Cover wall preview - not live
      </div>
      <Header />
      <main>
        <CoverWallPreview catalog={coverCatalog} />
      </main>
      <Footer />
    </MarketingTheme>
  )
}
