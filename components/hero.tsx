"use client"

import { ArrowDown } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export function Hero() {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/vinyl-press-hero.jpg"
          alt="Vinyl record pressing machine"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-black/60" />
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
      <div className="absolute top-44 right-24 z-20 hidden lg:block opacity-90 hover:opacity-100 transition-opacity duration-300">
        <Image
          src="/images/10-year-badge.png"
          alt="Celebrating 10 Years in the Art of Pressing Vinyl"
          width={350}
          height={281}
          className="w-[280px] xl:w-[340px] h-auto block [mix-blend-mode:screen]"
        />
      </div>

      <div className="relative z-10 w-full px-6 pt-28 pb-20">
        <div className="flex flex-col items-start gap-6 max-w-3xl mx-auto lg:mx-0 lg:ml-[8%]">
          {/* Logo - smaller */}
          <div className="relative">
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
