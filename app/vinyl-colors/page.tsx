"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Header } from "@/components/header"

const SUPABASE_URL = "https://ihqnczpjjtvtjdtwwzre.supabase.co/storage/v1/object/public/Vinyl-Colors/record-images"

// Solid Colors
const solidColors = [
  { name: "Black", image: "Vinyl-Mock-Black-Solid-new-copy.jpg" },
  { name: "White", image: "Vinyl-Mock-White-Solid-new-copy.jpg" },
  { name: "Silver", image: "Vinyl-Silver-Solid-new-copy.jpg" },
  { name: "Gold", image: "NORP-Gold-new2-copy.jpg" },
  { name: "Red", image: "Vinyl-Mock-Red-Solid-new-copy.jpg" },
  { name: "Pink", image: "NORP-Vinyl-Pink-new-copy.jpg" },
  { name: "Orange", image: "Vinyl-Mock-Orange-Solid-new-2.jpg" },
  { name: "Yellow", image: "NORP-Vinyl-Yellow-new-copy.jpg" },
  { name: "Green", image: "NORP-Green-New-copy.jpg" },
  { name: "Green Mix", image: "NORP-Green-Mix-New-copy.jpg" },
  { name: "Teal Mix", image: "NORP-Teal-Mix-new-copy.jpg" },
  { name: "Blue", image: "Vinyl-Mock-Blue-Solid2022-new-copy.jpg" },
  { name: "Deep Purple", image: "Vinyl-Mock-DEEP-Purple-NEW-copy.jpg" },
  { name: "Purple Mix", image: "NORP-Purple-Mix-new-copy.jpg" },
  { name: "Brown", image: "NORP-Brown-2-copy.jpg" },
  { name: "Mint", image: "NORP-MINT-new-copy.jpg" },
]

// Translucent Colors
const translucentColors = [
  { name: "Clear", image: "Vinyl-Mock-Clear-Solid-new-copy.jpg" },
  { name: "Coke Bottle Clear", image: "Coke-Bottle-Clear-new-copy.jpg" },
  { name: "Trans Red", image: "NORP-Vinyl-Mock-Trans-Red-new-copy.jpg" },
  { name: "Trans Pink", image: "NORP-Vinyl-TRANS-Pink-new-copy.jpg" },
  { name: "Trans Orange", image: "Vinyl-Mock-Trans-Orange-new-copy.jpg" },
  { name: "Trans Yellow", image: "NORP-Vinyl-TRANS-Yellow-new-copy.jpg" },
  { name: "Trans Blue", image: "Vinyl-Mock-trans-Blue-new-copy.jpg" },
  { name: "Trans Sky Blue", image: "Vinyl-Mock-trans-sky-Blue-new-2-copy.jpg" },
  { name: "Trans Purple", image: "NORP-Trans-Purple-new2-copy.jpg" },
  { name: "Trans Green", image: "NORP-Trans-GREEN-black-smoke-new-copy.jpg" },
  { name: "Trans Silver", image: "Vinyl-Mock-Trans-Silver-new-copy.jpg" },
  { name: "Trans Gold", image: "Vinyl-Mock-Gold-Trans-new2-copy.jpg" },
  { name: "Trans Black (Black Ice)", image: "Vinyl-Mock-Trans-Black-new-copy.jpg" },
]

// Splatter Colors
const splatterColors = [
  { name: "Black White Splatter", image: "Vinyl-Mock-Black-White-Splatter-new-copy.jpg" },
  { name: "Blue w/ Blue Splatter", image: "Blue-w-blue-splatter-new-copy.jpg" },
  { name: "Blue w/ Pink Splatter", image: "blue-with-pink-splatter-new-copy.jpg" },
  { name: "Blue Yellow Splatter", image: "Vinyl-Mock-Blue-Yellow-Splatter-new-copy.jpg" },
  { name: "Clear w/ Blue Green Yellow Splatter", image: "Clear-w-blue-green-yellow-splatter-new-copy.jpg" },
  { name: "Clear w/ Purple Black Splatter", image: "CLEAR-w-purple-and-black-splatter-new-copy.jpg" },
  { name: "Clear Black White Splatter", image: "Vinyl-Mock-Clear-Black-White-Splatter-new-copy.jpg" },
  { name: "Clear Blue White Splatter", image: "Vinyl-Mock-Clear-Blue_White-Splatter-2-new-copy.jpg" },
  { name: "Clear Gold Splatter", image: "Vinyl-Mock-Clear-Gold-Splatter-new-copy.jpg" },
  { name: "Clear Red Splatter", image: "Vinyl-Mock-Clear-Red-Splatter-new-copy.jpg" },
  { name: "Clear Orange Red Yellow Splatter", image: "Vinyl-Mock-Clear_Orange_Red_Yellow_Splatter-new-copy.jpg" },
  { name: "Clear Pink Black Splatter", image: "Vinyl-Mock-Clear_Pink_Black_Splatter-new-copy.jpg" },
  { name: "Clear Red Yellow Splatter", image: "Vinyl-Mock-Clear_Red_Yellow_Splatter-new-copy.jpg" },
  { name: "Clear Silver Gold Red Splatter", image: "Vinyl-Mock-Clear_Silver_Gold_Red_Splatter-new-copy.jpg" },
  { name: "Clear Purple Yellow Splatter", image: "Vinyl-Mock-Template-Clear-Purp-Yel-Splat-new-copy.jpg" },
  { name: "Clear Yellow Red Blue Black Splatter", image: "Vinyl-Mock-Clear-yellow-red-blue-black_Splatter-new-copy.jpg" },
  { name: "Clear Red Black Splatter", image: "NOVC-Clear_Red-Black_Splatter-new-copy.jpg" },
  { name: "Gold Black Splatter", image: "Vinyl-Mock-Gold_Black-Splatter-new-copy.jpg" },
  { name: "Mardi Gras Splatter", image: "Mardi-Gras-Splatter-Mock-new-copy.jpg" },
  { name: "Orange Blue White Splatter", image: "Vinyl-Mock-Orange-Blue-White-Splatter-new-copy.jpg" },
  { name: "Patriot Splatter", image: "NOVC-Patriot_Splatter-new-copy.jpg" },
  { name: "Red Black Splatter", image: "Vinyl-Mock-Red_Black-Splatter-new-copy.jpg" },
  { name: "Red Blue Black White Splatter", image: "Vinyl-Mock-Red-Blue_Black_White-Splatter-new-copy.jpg" },
  { name: "Red Blue White Splatter", image: "Vinyl-Mock-Red-Blue_White-Splatter-new.jpg" },
  { name: "Red Yellow Splatter", image: "Vinyl-Mock-Red-Yellow-Splatter-new-copy.jpg" },
  { name: "Silver w/ Black White Splatter", image: "NORP-Silver-w-black-and-white-splatter-new-copy.jpg" },
  { name: "Silver w/ White Splatter", image: "Silver-with-White-Splatter-new-copy.jpg" },
  { name: "Trans Blue Red Splatter", image: "Vinyl-Mock-Trans-Blue-Red-Splatter-new-copy.jpg" },
  { name: "Trans Red Clear Splatter", image: "Vinyl-Mock-Trans-Red-Red-Clear-Splatter-new-copy.jpg" },
  { name: "White Purple Green Splatter", image: "Vinyl-Mock-White-Purple_Green-Splatter-new-copy.jpg" },
  { name: "White Red Splatter", image: "White-Red-Platter-new-copy.jpg" },
  { name: "Yellow Black Splatter", image: "Vinyl-Mock-Yellow_Black-Splatter-new-copy.jpg" },
  { name: "Yellow Red Splatter", image: "Vinyl-Mock-Yellow_Red_Splatter-new-copy.jpg" },
  { name: "Yellow w/ Blue Splatter", image: "Yellow-with-blue-splatter-new-copy.jpg" },
]

// Marble Colors
const marbleColors = [
  { name: "Black Gold Silver Marble", image: "Vinyl-Mock-Black_Gold_Silver-Marble-new-copy.jpg" },
  { name: "Black Silver Marble", image: "Vinyl-Mock-Black-Silver-Marble-new-copy.jpg" },
  { name: "Black White Marble", image: "Vinyl-Mock-Black-White-Marble-new-copy.jpg" },
  { name: "Blue Black White Marble", image: "Blue-Black-White-Marble-new-copy.jpg" },
  { name: "Blue Gold Marble", image: "Vinyl-Mock-Blue_Gold_Marble-new-copy.jpg" },
  { name: "Blue Pink Marble", image: "Vinyl-Mock-Blue-Pink-Marble-new-copy.jpg" },
  { name: "Blue Purple Marble", image: "NORP-Blue_Purple-Marble-copy.jpg" },
  { name: "Blue Red Marble", image: "Blue-and-red-marble-Vinyl-Mock-new-copy.jpg" },
  { name: "Blue Silver Marble", image: "Vinyl-Mock-Blue_Silver-MArble-new-copy.jpg" },
  { name: "Blue White Marble", image: "Vinyl-Mock-Blue-White-Marble-new-copy.jpg" },
  { name: "Blue White & Blue Green Marble", image: "Vinyl-Mock-Blue-White-_-Blue-Green-Marble-new-copy.jpg" },
  { name: "Brown White Marble", image: "NORP-brown-white-marble-copy.jpg" },
  { name: "Gold Silver Marble", image: "NORP-Gold-and-Silver-Marble-new-copy.jpg" },
  { name: "Gold White Marble", image: "Vinyl-Mock-Gold-White-Marble-NEW-copy.jpg" },
  { name: "Green Black Marble", image: "NORP-Green_Black_Marble-new-copy.jpg" },
  { name: "Green Blue Marble", image: "Vinyl-Green-Blue-Marble-new-copy.jpg" },
  { name: "Green Gold Marble", image: "Green-and-gold-marble-new.jpg" },
  { name: "Green Red Marble", image: "Vinyl-Mock-Green-Red-Marble-new-copy.jpg" },
  { name: "Green Silver Marble", image: "Green-and-silver-marble-new-copy.jpg" },
  { name: "Green White Marble", image: "Vinyl-Green-White-Marble-new-copy.jpg" },
  { name: "Green Yellow Marble", image: "Vinyl-Mock-Green-Yellow-Marble-new-copy.jpg" },
  { name: "Light Blue Gold Marble", image: "Vinyl-Mock-Light-Blue_Gold_Marble-new-copy.jpg" },
  { name: "Orange Blue Marble", image: "Vinyl-Mock-Orange-Blue-Marble-new-copy.jpg" },
  { name: "Orange Gold Marble", image: "Vinyl-Mock-Orange_Gold_Marble-new-copy.jpg" },
  { name: "Orange Purple Marble", image: "Orange-Purple-Marble-new-copy.jpg" },
  { name: "Orange White Marble", image: "Orange-White-Marble-new-copy.jpg" },
  { name: "Orange Yellow Marble", image: "Vinyl-Mock-Orange-Yellow-Marble-new-copy.jpg" },
  { name: "Pink Gold Marble", image: "Vinyl-Mock-Pink-Gold-Marble-NEW-copy.jpg" },
  { name: "Purple Gold Marble", image: "purple-and-gold-marble-new-copy.jpg" },
  { name: "Purple Pink Marble", image: "Vinyl-Mock-Purple_Pink-Marble-new-2-copy.jpg" },
  { name: "Purple Silver Marble", image: "purple-and-silver-marble-new-copy.jpg" },
  { name: "Purple White Marble", image: "Vinyl-Mock-Purple-White-Marble-new-copy.jpg" },
  { name: "Red Gold Marble", image: "Vinyl-Mock-Red-Gold-Marble-new-copy.jpg" },
  { name: "Red Purple Marble", image: "Vinyl-Mock-Red_Purple-Marble-new-copy.jpg" },
  { name: "Red Silver Marble", image: "Vinyl-Mock-Red-Silver-Marble-new-copy.jpg" },
  { name: "Red White Marble", image: "Vinyl-Mock-Red-White-Marble-new-copy.jpg" },
  { name: "Red Yellow Marble", image: "Vinyl-Mock-Red-Yellow-Marble-new-copy.jpg" },
  { name: "Trans Red Yellow Marble", image: "Vinyl-Mock-Trans-Red-Yellow-Marble-new-copy.jpg" },
]

// Smoke Colors
const smokeColors = [
  { name: "Blue White Smoke", image: "Vinyl-Mock-Blue-White-Smoke-new-copy.jpg" },
  { name: "Blue White Smoke 2", image: "Vinyl-Mock-Blue-White-Smoke-2-new-copy.jpg" },
  { name: "Brown w/ Black Smoke", image: "NORP-Brown-w-black-smoke-copy.jpg" },
  { name: "Brown w/ White Smoke", image: "NORP-Brown-w-white-smoke-copy.jpg" },
  { name: "Clear Black Smoke", image: "Vinyl-Clear-Black-Smoke-new-copy.jpg" },
  { name: "Clear w/ Pink Yellow Blue Smoke", image: "NORP-Clear-w-pink-yellow-blue-smoke-copy.jpg" },
  { name: "Clear White Smoke w/ Red Splatter", image: "Vinyl-Mock-Clear-White-Smoke_Red_Splatter-new-copy.jpg" },
  { name: "Clear White Smoke", image: "Vinyl-Clear-White-Smoke-new-copy.jpg" },
  { name: "Cloudy White Blue Purple Smoke", image: "Vinyl-Mock-Cloudy-White-Blue_Purple-Smoke-new-copy.jpg" },
  { name: "Cloudy White Purple Blue Orange Smoke", image: "Vinyl-Mock-Cloudy-White-Purple-Blue-Orange-Smoke-new-copy.jpg" },
  { name: "Cloudy White Purple Blue Orange Yellow Smoke", image: "Vinyl-Mock-Cloudy-White-Purple-Blue-Orange-Yellow-Smoke-new-copy.jpg" },
  { name: "Dead Bunny Smoke", image: "Vinyl-Mock-DeadBunny-Smoke-new-copy.jpg" },
  { name: "Dead Fox Smoke", image: "Vinyl-Mock-Dead-Fox-Smoke-new-copy.jpg" },
  { name: "Gold White Smoke", image: "Vinyl-Mock-Gold-White-Smoke-new-copy.jpg" },
  { name: "Gold Yellow Smoke", image: "Vinyl-Mock-Gold-Yellow-Smoke-new-copy.jpg" },
  { name: "Green White Smoke", image: "Vinyl-Mock-Green-White-Smoke-new-copy.jpg" },
  { name: "Green Yellow Smoke", image: "Vinyl-Mock-Green-Yellow-Smoke-new-copy.jpg" },
  { name: "Grey w/ Black Smoke", image: "NORP-grey-w.-black-smoke-copy.jpg" },
  { name: "Milky Clear Brown Smoke", image: "NORP-milky-clear-w-brown-smoke-copy.jpg" },
  { name: "Milky Clear Orange Smoke", image: "Milky-Clear-Orange-Smoke-new-copy.jpg" },
  { name: "Napalm Smoke", image: "Vinyl-Mock-Napalm-Smoke-new-copy.jpg" },
  { name: "Orange w/ Black Smoke", image: "NORP-orange-w-black-smoke-new-copy.jpg" },
  { name: "Orange Red Smoke", image: "Vinyl-Mock-Orange-Red-Smoke-new-copy.jpg" },
  { name: "Orange White Smoke", image: "Vinyl-Mock-Orange-White-Smoke-new-copy.jpg" },
  { name: "Orange Yellow Smoke", image: "Vinyl-Mock-Orange-Yellow-Smoke-new-copy.jpg" },
  { name: "Pink Blue White Smoke", image: "Vinyl-Mock-Pink_Blue_White-SMoke-new-copy.jpg" },
  { name: "Pink Purple Smoke", image: "Vinyl-Mock-Pink-Purple-Smoke-new-copy.jpg" },
  { name: "Pink White Smoke", image: "Vinyl-Mock-Pink-White-Smoke-new-copy.jpg" },
  { name: "Pink w/ Yellow Smoke", image: "NORP-Pink-w-yellow-smoke-copy.jpg" },
  { name: "Purple and Black Smoke", image: "NORP-purple-and-black-new-2.jpg" },
  { name: "Purple Rain Smoke", image: "Vinyl-Mock-purple-rain-new-copy.jpg" },
  { name: "Red Black Smoke", image: "Vinyl-Mock-Red-Black-Smoke-new-copy.jpg" },
  { name: "Red Purple Smoke", image: "Vinyl-Mock-Red-Purple-Smoke-2-new-copy-1.jpg" },
  { name: "Red Yellow Smoke", image: "Vinyl-Mock-Red-Yellow-Smoke-new-copy.jpg" },
  { name: "Silver Red Smoke", image: "Vinyl-Silver-Red-Smoke-2-new-copy.jpg" },
  { name: "Silver White Smoke", image: "Vinyl-Mock-Silver_White-Smoke-new-copy.jpg" },
  { name: "Sky Blue w/ Gold Smoke", image: "NORP-Sky-blue-w-gold-HD-copy.jpg" },
  { name: "Slimer Smoke", image: "Vinyl-Mock-slimer-new-copy.jpg" },
  { name: "Smoked Out Heavy", image: "NORP-Smoked-Out-heavy-new-copy.jpg" },
  { name: "Smoked Out Light", image: "NORP-Smoked-Out-light-new-copy.jpg" },
  { name: "Teal Black Smoke", image: "Vinyl-Mock-Teal-Black-Smoke-new-copy.jpg" },
  { name: "Toxic Avenger Smoke", image: "Toxic-Avenger-new-copy.jpg" },
  { name: "Trans Orange White Smoke", image: "Vinyl-Mock-Trans-Orange-White-Smoke-new-copy.jpg" },
  { name: "Trans Red Yellow Smoke", image: "Vinyl-Mock-Trans-Red-yellow-smoke-new-copy.jpg" },
  { name: "Trans Yellow Red Smoke", image: "Vinyl-Trans-Yellow-Red-Smoke-new-copy.jpg" },
  { name: "White Metal Red Smoke", image: "Vinyl-Mock-White-Metal-Red-Smoke-new-copy.jpg" },
  { name: "White Pink Marble Purple Smoke", image: "Vinyl-Mock-White-Pink-Marble-Purple-SMoke-new-copy.jpg" },
  { name: "White Pink Smoke", image: "White-Pink-Smoke-new-copy.jpg" },
  { name: "White Purple Smoke", image: "Vinyl-Mock-White-Purple-Smoke-new-copy.jpg" },
  { name: "Yellow Green Smoke", image: "Yellow-Green-Smoke-new-copy.jpg" },
  { name: "Yellow Red Smoke (Campfire)", image: "Vinyl-Mock-Yellow_Red-Smoke-Campfire-new-copy.jpg" },
  { name: "Yellow w/ Purple Smoke", image: "NORP-yellow-w-purple-smoke-copy.jpg" },
]

const categories = [
  { id: "solid", name: "Solid", colors: solidColors },
  { id: "translucent", name: "Translucent", colors: translucentColors },
  { id: "splatter", name: "Splatter", colors: splatterColors },
  { id: "marble", name: "Marble", colors: marbleColors },
  { id: "smoke", name: "Smoke", colors: smokeColors },
]

function VinylCard({ name, image }: { name: string; image: string }) {
  const imageUrl = `${SUPABASE_URL}/${image}`
  
  return (
    <div className="group">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-card mb-3">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
        />
      </div>
      <p className="text-sm text-center text-muted-foreground group-hover:text-foreground transition-colors">
        {name}
      </p>
    </div>
  )
}

export default function VinylColorsPage() {
  const [activeCategory, setActiveCategory] = useState("solid")
  
  const currentCategory = categories.find(c => c.id === activeCategory)
  
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          {/* Hero */}
          <div className="mb-12">
            <p className="text-primary font-mono text-sm uppercase tracking-[0.3em] mb-4">
              Record Pressing
            </p>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold uppercase tracking-tight mb-6 text-balance">
              Vinyl Color Options
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
              View our colored vinyl options, custom mixed variations, and weight choices for our 12 inch pressing service. The images below are mockups and examples. Due to vinyl manufacturers and availability, some colors may be a different shade.
            </p>
          </div>

          {/* Mystery Color Special */}
          <div className="mb-12 p-6 md:p-8 border-2 border-primary bg-primary/5 relative overflow-hidden rounded-lg">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground px-4 py-1 text-xs font-bold uppercase tracking-wider rounded-bl-lg">
              Special Offer
            </div>
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
              <Sparkles className="w-12 h-12 text-primary flex-shrink-0" />
              <div>
                <h3 className="text-xl md:text-2xl font-bold uppercase tracking-tight mb-2 text-foreground">
                  Mystery Color Special
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Let us randomly choose a vinyl color for your new project, and you&apos;ll get it for the same price as black wax. Colors depend on what&apos;s in stock and will likely be a splatter, marble, or smoke variation.
                </p>
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="sticky top-[73px] z-40 bg-background/95 backdrop-blur-sm border-b border-border -mx-6 px-6 mb-8">
            <div className="flex gap-1 overflow-x-auto py-4 scrollbar-hide">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`px-6 py-3 text-sm font-medium uppercase tracking-wider whitespace-nowrap transition-colors rounded-lg ${
                    activeCategory === category.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {category.name}
                  <span className="ml-2 text-xs opacity-60">({category.colors.length})</span>
                </button>
              ))}
            </div>
          </div>
      
          {/* Color Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {currentCategory?.colors.map((color) => (
              <VinylCard key={color.name} name={color.name} image={color.image} />
            ))}
          </div>
        </div>
      </main>
      
      {/* Info Section */}
      <section className="border-t border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-tight mb-4">Weights</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">150g Standard Weight</span>
                  <span className="font-mono text-primary">Default</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">180g Heavy Weight</span>
                  <span className="font-mono text-primary">+$0.35/unit</span>
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="text-2xl font-bold uppercase tracking-tight mb-4">Setup Fees</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">Press Setup (per side)</span>
                  <span className="font-mono text-primary">$140</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-border">
                  <span className="text-muted-foreground">Color Setup (per color)</span>
                  <span className="font-mono text-primary">$100</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-12 p-6 bg-secondary rounded-lg">
            <h3 className="font-bold uppercase tracking-wider mb-2">Custom Colors</h3>
            <p className="text-muted-foreground">
              Don&apos;t see the exact color you&apos;re looking for? We offer custom color matching 
              for an additional fee. Contact us with your Pantone color or physical sample and 
              we&apos;ll work with you to create your perfect vinyl.
            </p>
          </div>
        </div>
      </section>
      
      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold uppercase tracking-tight mb-4">
            Ready to Press?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Get started on your vinyl project today. Our team is ready to help bring your music to life.
          </p>
          <Link
            href="/#contact"
            className="inline-flex px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors"
          >
            Get a Quote
          </Link>
        </div>
      </section>
    </div>
  )
}
