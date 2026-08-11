import { Header } from "@/components/hoxton/header"
import { Hero } from "@/components/hoxton/hero"
import { Manufacturing } from "@/components/hoxton/manufacturing"
import { RecentWork } from "@/components/hoxton/recent-work"
import { VinylColors } from "@/components/hoxton/vinyl-colors"
import { WhyChoose } from "@/components/hoxton/why-choose"
import { Contact } from "@/components/hoxton/contact"
import { Footer } from "@/components/hoxton/footer"

export default function PreviewPage() {
  return (
    <>
      {/* Preview-only banner so this is never mistaken for the live site */}
      <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-white/15 bg-black/80 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-white/60 backdrop-blur">
        Redesign preview · not live
      </div>

      <Header />
      <main>
        <Hero />
        <Manufacturing />
        <RecentWork />
        <VinylColors />
        <WhyChoose />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
