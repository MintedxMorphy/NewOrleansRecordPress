import Link from "next/link"
import { Instagram, Facebook } from "lucide-react"

export function Footer() {
  return (
    <footer className="py-16 bg-card border-t border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">NR</span>
              </div>
              <div>
                <p className="font-bold uppercase tracking-widest text-foreground">New Orleans</p>
                <p className="font-bold uppercase tracking-widest text-primary">Record Press</p>
              </div>
            </Link>
            <p className="text-muted-foreground leading-relaxed max-w-md">
              New Orleans&apos; first and only independently owned vinyl record manufacturing plant. Providing high-quality custom pressing since day one.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground mb-6">Quick Links</h4>
            <nav className="flex flex-col gap-3">
              <Link href="#services" className="text-muted-foreground hover:text-primary transition-colors">Services</Link>
              <Link href="#vinyl-colors" className="text-muted-foreground hover:text-primary transition-colors">Vinyl Colors</Link>
              <Link href="#about" className="text-muted-foreground hover:text-primary transition-colors">About Us</Link>
              <Link href="#contact" className="text-muted-foreground hover:text-primary transition-colors">Get a Quote</Link>
            </nav>
          </div>

          <div>
            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground mb-6">Contact</h4>
            <div className="space-y-3 text-muted-foreground">
              <p>New Orleans, Louisiana</p>
              <a href="tel:504-975-6569" className="block hover:text-primary transition-colors">504-975-6569</a>
              <a href="mailto:info@neworleansrecordpress.com" className="block hover:text-primary transition-colors text-sm break-all">
                info@neworleansrecordpress.com
              </a>
            </div>
            <div className="flex gap-4 mt-6">
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                aria-label="Instagram"
              >
                <Instagram size={18} />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                aria-label="Facebook"
              >
                <Facebook size={18} />
              </a>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} New Orleans Record Press. All rights reserved.
          </p>
          <p className="text-sm text-muted-foreground font-mono">
            Made with love in NOLA
          </p>
        </div>
      </div>
    </footer>
  )
}
