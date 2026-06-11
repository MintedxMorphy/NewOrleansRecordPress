"use client"

import { useState } from "react"
import { ArrowDown } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

type HeroProps = {
  imageSrc?: string
  imageMood?: "classic" | "timeless"
  videoSrc?: string
  videoMood?: "raw" | "warm" | "psychedelic"
}

export function Hero({ imageSrc, imageMood = "classic", videoSrc, videoMood = "warm" }: HeroProps = {}) {
  const isRaw = videoMood === "raw"
  const isPsychedelic = videoMood === "psychedelic"
  const isTimelessImage = imageMood === "timeless"
  const [loopFade, setLoopFade] = useState(0)

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        {videoSrc ? (
          <>
            <video
              className={
                isRaw
                  ? "h-full w-full translate-x-[35%] translate-y-[3%] scale-[1.75] object-cover"
                  : isPsychedelic
                  ? "h-full w-full -translate-x-[7%] translate-y-[3%] scale-[1.12] object-cover brightness-[0.82] contrast-[1.16] saturate-[1.06] sepia-[0.18]"
                  : "h-full w-full -translate-x-[7%] translate-y-[3%] scale-[1.12] object-cover brightness-[0.92] contrast-[1.08] saturate-[0.92] sepia-[0.1]"
              }
              autoPlay
              muted
              loop
              playsInline
              poster="/images/vinyl-press-hero-original-backup.jpg"
              preload="auto"
              aria-label="Record pressing room video loop"
              onTimeUpdate={(event) => {
                const video = event.currentTarget
                const duration = video.duration

                if (!Number.isFinite(duration) || duration <= 0) {
                  return
                }

                const fadeWindow = 0.9
                const remaining = duration - video.currentTime
                const fadeAtStart = Math.max(0, (fadeWindow - video.currentTime) / fadeWindow)
                const fadeAtEnd = Math.max(0, (fadeWindow - remaining) / fadeWindow)
                const nextFade = isRaw ? 0 : Math.max(fadeAtStart, fadeAtEnd) * (isPsychedelic ? 0.34 : 0.24)

                setLoopFade((currentFade) => (Math.abs(currentFade - nextFade) > 0.03 ? nextFade : currentFade))
              }}
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
            {!isRaw && (
              <>
                <div
                  className={
                    isPsychedelic
                      ? "absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,226,174,0.16),rgba(0,0,0,0.08)_40%,rgba(0,0,0,0.52)_100%)]"
                      : "absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,244,208,0.18),rgba(0,0,0,0.04)_42%,rgba(0,0,0,0.38)_100%)]"
                  }
                />
                <div
                  className={
                    isPsychedelic
                      ? "absolute inset-0 bg-[linear-gradient(90deg,rgba(70,44,20,0.26),rgba(34,69,45,0.14),rgba(22,12,28,0.28))] mix-blend-multiply"
                      : "absolute inset-0 bg-[linear-gradient(90deg,rgba(62,46,22,0.18),rgba(123,83,34,0.12),rgba(12,20,14,0.22))] mix-blend-multiply"
                  }
                />
              </>
            )}
            {isPsychedelic && (
              <>
                <div
                  className="absolute inset-0 animate-analog-color-drift opacity-[0.2] mix-blend-soft-light"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 58% 43%, rgba(214, 142, 52, 0.48), transparent 27%), radial-gradient(circle at 73% 58%, rgba(55, 190, 142, 0.54), transparent 25%), radial-gradient(circle at 39% 31%, rgba(170, 78, 198, 0.5), transparent 31%)",
                  }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_59%_51%,rgba(0,0,0,0.42),rgba(0,0,0,0.24)_18%,transparent_38%)] mix-blend-multiply" />
                <div className="absolute left-[52.8%] top-[68.3%] hidden h-[14%] w-[16.8%] -rotate-[1deg] rounded-md bg-black/55 blur-md md:block" />
                <div className="absolute left-[55.2%] top-[71.8%] hidden h-[7.8%] w-[12.8%] -rotate-[1deg] rounded-[3px] bg-black/95 shadow-[0_0_18px_rgba(0,0,0,0.9)] md:block" />
              </>
            )}
            {!isRaw && (
              <>
                <div
                  className={
                    isPsychedelic
                      ? "absolute inset-0 opacity-[0.18] mix-blend-overlay"
                      : "absolute inset-0 opacity-[0.1] mix-blend-overlay"
                  }
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.45) 0 1px, transparent 1px), radial-gradient(circle at 72% 64%, rgba(255,255,255,0.35) 0 1px, transparent 1px)",
                    backgroundSize: "13px 17px, 19px 23px",
                  }}
                />
                <div className={isPsychedelic ? "absolute inset-0 bg-black/18" : "absolute inset-0 bg-black/12"} />
                <div
                  className="absolute inset-0 bg-black transition-opacity duration-300"
                  style={{ opacity: loopFade }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Image
              src={imageSrc ?? "/images/vinyl-press-hero.jpg"}
              alt="Vinyl record pressing machine"
              fill
              className={
                isTimelessImage
                  ? "object-cover object-[center_34%] brightness-[0.96] contrast-[1.06] saturate-[0.94] sepia-[0.05]"
                  : "object-cover"
              }
              priority
            />
            {isTimelessImage ? (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_56%_38%,rgba(255,240,202,0.06),rgba(0,0,0,0.08)_44%,rgba(0,0,0,0.42)_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.48),rgba(37,25,13,0.12)_44%,rgba(0,0,0,0.2)_100%)]" />
                <div
                  className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 16% 22%, rgba(255,255,255,0.5) 0 1px, transparent 1px), radial-gradient(circle at 68% 58%, rgba(255,255,255,0.36) 0 1px, transparent 1px)",
                    backgroundSize: "12px 16px, 19px 23px",
                  }}
                />
              </>
            ) : (
              <div className="absolute inset-0 bg-black/60" />
            )}
          </>
        )}
      </div>

      {/* Spinning Record Animation */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/3 opacity-10 pointer-events-none hidden lg:block">
        <div className="w-[600px] h-[600px] md:w-[800px] md:h-[800px] rounded-full border border-foreground animate-spin-slow">
          <div className="absolute inset-[20%] rounded-full border border-foreground" />
          <div className="absolute inset-[40%] rounded-full border border-foreground" />
          <div className="absolute inset-[45%] rounded-full bg-foreground" />
        </div>
      </div>

      {/* 10-Year Anniversary Badge — top-right, black bg blends via screen mode */}
      <div className="absolute top-32 right-10 z-20 hidden lg:block overflow-hidden rounded-2xl opacity-60 hover:opacity-80 transition-opacity duration-300">
        <Image
          src="/images/10-year-badge.png"
          alt="Celebrating 10 Years in the Art of Pressing Vinyl"
          width={438}
          height={351}
          className="w-[280px] xl:w-[340px] h-auto block rounded-2xl [mix-blend-mode:screen]"
        />
      </div>

      <div className="relative z-10 w-full px-6 pt-44 pb-20 lg:px-0">
        <div className="flex -translate-y-6 flex-col items-start gap-6 max-w-3xl mx-auto lg:mx-0 lg:ml-10 lg:-translate-y-10">
          {/* Logo - smaller */}
          <div className="relative mt-4 lg:mt-6">
            <Image
              src="/images/norp-logo.png"
              alt="New Orleans Record Press"
              width={400}
              height={120}
              className="w-[200px] md:w-[280px] lg:w-[320px] h-auto"
              priority
            />
          </div>
          
          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight max-w-lg">
            Pure Analog Craftsmanship from the Heart of New Orleans
          </h1>
          
          {/* Description */}
          <p className="text-base md:text-lg text-[#aaaaaa] max-w-lg leading-relaxed">
            An independent, artisan vinyl press dedicated to flawless 12&quot; and 7&quot; high-fidelity playback. From exclusive 100-unit private pressings to expansive audiophile runs in the tens of thousands, we preserve the warmth of your sound with uncompromising quality control.
          </p>

          {/* Single CTA Button */}
          <Link
            href="#contact"
            className="px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-all inline-flex items-center justify-center gap-2 glow-green hover:glow-green-strong rounded-lg"
          >
            Start Your Project
          </Link>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Scroll</span>
        <ArrowDown size={16} className="text-muted-foreground" />
      </div>
    </section>
  )
}
