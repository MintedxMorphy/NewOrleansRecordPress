"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

const SUPABASE_URL = "https://ihqnczpjjtvtjdtwwzre.supabase.co/storage/v1/object/public/Vinyl-Colors/record-images"

// Preview of colors - a sample from each category using real images
const previewColors = [
  { name: "Black", image: "Vinyl-Mock-Black-Solid-new-copy.jpg" },
  { name: "White", image: "Vinyl-Mock-White-Solid-new-copy.jpg" },
  { name: "Red", image: "Vinyl-Mock-Red-Solid-new-copy.jpg" },
  { name: "Gold", image: "NORP-Gold-new2-copy.jpg" },
  { name: "Blue", image: "Vinyl-Mock-Blue-Solid2022-new-copy.jpg" },
  { name: "Clear", image: "Vinyl-Mock-Clear-Solid-new-copy.jpg" },
  { name: "Mardi Gras", image: "Mardi-Gras-Splatter-Mock-new-copy.jpg" },
  { name: "Gotham Marble", image: "Vinyl-Mock-Black-White-Marble-new-copy.jpg" },
  { name: "Purple Rain", image: "Vinyl-Mock-purple-rain-new-copy.jpg" },
  { name: "Slimer", image: "Vinyl-Mock-slimer-new-copy.jpg" },
  { name: "Trans Purple", image: "NORP-Trans-Purple-new2-copy.jpg" },
  { name: "Miami Vice", image: "Vinyl-Mock-Pink-Purple-Smoke-new-copy.jpg" },
]

function ColorCard({ name, image }: { name: string; image: string }) {
  const imageUrl = `${SUPABASE_URL}/${image}`
  
  return (
    <div className="group cursor-pointer">
      <div className="aspect-square relative overflow-hidden rounded-lg bg-card">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 16vw, 8vw"
        />
      </div>
      <p className="text-center text-xs font-medium uppercase tracking-wider mt-2 text-muted-foreground group-hover:text-primary transition-colors">
        {name}
      </p>
    </div>
  )
}

export function VinylColors() {
  return (
    <section id="vinyl-colors" className="py-16 md:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="text-accent font-mono text-sm uppercase tracking-[0.3em] mb-4">
              Express Yourself
            </p>
            <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6 text-balance">
              Vinyl Color Options
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Choose from our extensive selection of over 150 vinyl colors including solid, translucent, splatter, marble, and smoke effects.
            </p>
          </div>
          <Link
            href="/vinyl-colors"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-all rounded-lg whitespace-nowrap glow-green hover:glow-green-strong"
          >
            View All Colors
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Preview Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-4">
          {previewColors.map((vinyl, index) => (
            <ColorCard 
              key={index} 
              name={vinyl.name} 
              image={vinyl.image}
            />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/vinyl-colors"
            className="text-primary font-medium uppercase tracking-wider text-sm hover:underline inline-flex items-center gap-2"
          >
            See all 150+ color options including Splatter, Marble & Smoke
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
