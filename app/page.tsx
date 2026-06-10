import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Marquee } from "@/components/marquee"
import { Services } from "@/components/services"
import { RecentWorkStatic } from "@/components/recent-work-static"
import { VinylColors } from "@/components/vinyl-colors"
import { About } from "@/components/about"
import { Contact } from "@/components/contact"
import { Footer } from "@/components/footer"

export default function Home() {
  // New Orleans Record Press homepage
  return (
    <>
      <Header />
      <Marquee />
      <main>
        <Hero videoSrc="/videos/stylus-spinning-hero.mp4" videoMood="warm" />
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
