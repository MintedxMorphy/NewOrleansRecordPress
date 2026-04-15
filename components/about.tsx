import { Quote } from "lucide-react"

export function About() {
  return (
    <section id="about" className="py-16 md:py-20 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-accent font-mono text-sm uppercase tracking-[0.3em] mb-4">
              About Us
            </p>
            <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-8 text-balance">
              New Orleans&apos; First Record Press
            </h2>
            
            <div className="relative pl-8 border-l-2 border-primary mb-8">
              <Quote className="absolute -left-4 top-0 w-8 h-8 text-primary bg-card" />
              <blockquote className="text-xl md:text-2xl text-foreground leading-relaxed italic">
                We are proud to provide, for the first time in the city&apos;s history, a way for musical expression to be inscribed in an ageless vinyl format.
              </blockquote>
            </div>

            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>
                New Orleans Record Press is the city&apos;s first and only independently owned and operated vinyl record manufacturing plant offering custom vinyl pressing.
              </p>
              <p>
                We are committed to building long-term relationships with our clients by providing audiophile record pressings, transparent pricing, and attentive customer care.
              </p>
              <p>
                We will work closely with you to design a high-quality and affordable record package that suits your needs and budget.
              </p>
            </div>
          </div>

          <div className="relative">
            {/* Subtle Record Illustration */}
            <div className="relative aspect-square max-w-sm mx-auto">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    inset: `${i * 8}%`,
                    border: '1px solid #2a2a2a',
                    transform: `translateY(${i * 6}px)`,
                  }}
                >
                  {i === 0 && (
                    <>
                      <div className="absolute inset-[35%] rounded-full bg-[#141414] border border-[#2a2a2a] flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-xs font-bold uppercase tracking-wider text-accent">NORP</p>
                        </div>
                      </div>
                      <div className="absolute inset-[20%] rounded-full border border-primary/20" />
                      <div className="absolute inset-[25%] rounded-full border border-[#2a2a2a]" />
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Stats */}
            <div className="absolute -bottom-4 left-0 right-0 flex justify-center gap-6">
              <div className="bg-[#141414] p-5 border-l-2 border-primary">
                <p className="text-2xl font-bold text-primary">100+</p>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Min Order</p>
              </div>
              <div className="bg-[#141414] p-5 border-l-2 border-primary">
                <p className="text-2xl font-bold text-primary">1000s</p>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Max Run</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
