import { Disc3, Palette, Package, Headphones, Scissors, Zap, PenTool, Users } from "lucide-react"

const services = [
  {
    icon: Disc3,
    title: '12" & 7" Records',
    description: 'Standard weight (150g) and heavy weight (180g) vinyl pressing for any project size.',
  },
  {
    icon: Palette,
    title: 'Colored Vinyl',
    description: 'Wide range of color options to make your release stand out from the crowd.',
  },
  {
    icon: Package,
    title: 'Packaging',
    description: 'Blank and printed packaging styles including jackets, sleeves, and inserts.',
  },
  {
    icon: Headphones,
    title: 'Audio Mastering',
    description: 'Deluxe audio mastering services to ensure your music sounds its best on vinyl.',
  },
  {
    icon: Scissors,
    title: 'Lacquer Cutting',
    description: 'Precision lacquer cutting for pristine audio reproduction.',
  },
  {
    icon: Zap,
    title: 'Electroplating',
    description: 'Professional electroplating for durable, long-lasting masters.',
  },
  {
    icon: PenTool,
    title: 'Graphic Design',
    description: 'Professional graphic design services for labels, jackets, and complete packages.',
  },
  {
    icon: Users,
    title: 'Project Consulting',
    description: 'Expert guidance from concept to completion for your vinyl project.',
  },
]

export function Services() {
  return (
    <section id="services" className="py-16 md:py-20 bg-card">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <p className="text-accent font-mono text-sm uppercase tracking-[0.3em] mb-4">
            What We Do
          </p>
          <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6 text-balance">
            Full-Service Vinyl Manufacturing
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            From mastering to shipping, we handle every step of the vinyl production process with meticulous attention to detail.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          {services.map((service, index) => (
            <div
              key={index}
              className="bg-card p-8 group hover:bg-[#1a1a1a] transition-all border-l-2 border-transparent hover:border-primary"
            >
              <service.icon className="w-8 h-8 text-primary mb-6 group-hover:scale-110 transition-transform" />
              <h3 className="text-lg font-bold uppercase tracking-wide mb-3 text-foreground">
                {service.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 p-8 bg-[#141414]">
          <div className="flex flex-col md:flex-row md:items-center gap-6 justify-between">
            <div className="border-l-2 border-primary pl-6">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Current Turnaround</p>
              <p className="text-2xl md:text-3xl font-bold text-foreground">~2-3 Months</p>
            </div>
            <div className="h-px md:h-16 w-full md:w-px bg-border" />
            <div className="border-l-2 border-primary pl-6">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Minimum Order</p>
              <p className="text-2xl md:text-3xl font-bold text-primary">100 Units</p>
            </div>
            <div className="h-px md:h-16 w-full md:w-px bg-border" />
            <div className="border-l-2 border-primary pl-6">
              <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-2">Special Projects?</p>
              <p className="text-lg font-medium text-foreground">Contact us for custom options</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
