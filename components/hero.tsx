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
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden">
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
                  ? "object-cover object-[50%_62%] md:object-[50%_59%]"
                  : "object-cover"
              }
              priority
            />
            {isTimelessImage ? (
              <>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,240,202,0.03),rgba(0,0,0,0.04)_48%,rgba(0,0,0,0.22)_100%)]" />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.48),rgba(0,0,0,0.1)_42%,rgba(0,0,0,0.12)_100%)]" />
                <div
                  className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
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

      <div className="absolute left-5 top-20 z-20 sm:left-6 sm:top-24 lg:left-10 lg:top-[104px]">
        <Image
          src="/images/norp-logo-white-transparent.png"
          alt="New Orleans Record Press"
          width={774}
          height={291}
          className="h-auto w-[132px] sm:w-[158px] md:w-[218px] lg:w-[255px]"
          priority
        />
      </div>

      <div className="relative z-10 flex min-h-[100svh] w-full items-center px-5 pb-14 pt-24 sm:px-6 sm:pb-16 sm:pt-32 lg:px-0 lg:pt-28">
        <div className="mx-0 flex max-w-[22rem] flex-col items-start gap-5 sm:max-w-3xl sm:gap-6 md:mx-auto lg:mx-0 lg:ml-10">
          <div aria-hidden="true" className="mt-4 h-[50px] w-[132px] sm:h-[59px] sm:w-[158px] md:h-[82px] md:w-[218px] lg:mt-6 lg:h-[96px] lg:w-[255px]" />
          
          {/* Headline */}
          <h1 className="max-w-[20rem] text-[2.45rem] font-bold uppercase leading-[1.02] text-[#f3ca03] sm:max-w-lg sm:text-5xl sm:leading-tight md:text-6xl">
            PURE ANALOG CRAFTSMANSHIP FROM THE HEART OF NEW ORLEANS
          </h1>

          {/* Single CTA Button */}
          <Link
            href="#contact"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-7 py-4 text-sm font-bold uppercase tracking-wider text-primary-foreground transition-colors hover:bg-primary/90 sm:px-8 lg:text-base xl:text-lg"
          >
            Start Your Project
          </Link>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 animate-bounce md:flex">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Scroll</span>
        <ArrowDown size={16} className="text-muted-foreground" />
      </div>
    </section>
  )
}
