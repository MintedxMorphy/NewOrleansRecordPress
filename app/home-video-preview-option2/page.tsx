import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Marquee } from "@/components/marquee"
import { Services } from "@/components/services"
import { RecentWorkStatic } from "@/components/recent-work-static"
import { VinylColors } from "@/components/vinyl-colors"
import { About } from "@/components/about"
import { Contact } from "@/components/contact"
import { Footer } from "@/components/footer"

export default function HomeVideoPreviewOption2() {
  return (
    <>
      <Header />
      <Marquee />
      <main>
        <Hero videoSrc="/videos/press-hero-preview-option2.mp4" />
        <Services />
        <RecentWorkStatic />
        <VinylColors />
        <About />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
