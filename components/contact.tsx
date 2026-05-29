"use client"

import { useState } from "react"
import { Phone, Mail, MapPin, ArrowRight } from "lucide-react"

export function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    projectType: "",
    quantity: "",
    message: "",
  })
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("sending")
    setErrorMsg("")
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || "Unknown error")
      }
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  return (
    <section id="contact" className="py-16 md:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16">
          <div>
            <p className="text-accent font-mono text-sm uppercase tracking-[0.3em] mb-4">
              Get in Touch
            </p>
            <h2 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6 text-balance">
              Start Your Vinyl Project
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-12">
              Ready to press your music on vinyl? Contact us to discuss your project. We&apos;re here to help with everything from small runs to commercial pressings.
            </p>

            <div className="space-y-6">
              <a
                href="tel:504-975-6569"
                className="flex items-center gap-4 group"
              >
                <div className="w-12 h-12 bg-primary flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Phone</p>
                  <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                    504-975-6569
                  </p>
                </div>
              </a>

              <a
                href="mailto:info@neworleansrecordpress.com"
                className="flex items-center gap-4 group"
              >
                <div className="w-12 h-12 bg-primary flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Email</p>
                  <p className="text-lg font-medium text-foreground group-hover:text-primary transition-colors">
                    info@neworleansrecordpress.com
                  </p>
                </div>
              </a>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Location</p>
                  <p className="text-lg font-medium text-foreground">
                    New Orleans, Louisiana
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border p-8">
            <h3 className="text-xl font-bold uppercase tracking-wide mb-6 text-foreground">
              Request a Quote
            </h3>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="phone" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    placeholder="(555) 555-5555"
                  />
                </div>
                <div>
                  <label htmlFor="projectType" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                    Record Size *
                  </label>
                  <select
                    id="projectType"
                    name="projectType"
                    required
                    value={formData.projectType}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-input border border-border text-foreground focus:outline-none focus:border-primary transition-colors"
                  >
                    <option value="">Select size</option>
                    <option value="7-inch">7&quot; Record</option>
                    <option value="12-inch">12&quot; Record</option>
                    <option value="both">Both Sizes</option>
                    <option value="other">Other / Not Sure</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="quantity" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Estimated Quantity *
                </label>
                <select
                  id="quantity"
                  name="quantity"
                  required
                  value={formData.quantity}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-input border border-border text-foreground focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Select quantity</option>
                  <option value="100-250">100 - 250 units</option>
                  <option value="250-500">250 - 500 units</option>
                  <option value="500-1000">500 - 1,000 units</option>
                  <option value="1000+">1,000+ units</option>
                </select>
              </div>

              <div>
                <label htmlFor="message" className="block text-xs uppercase tracking-widest text-muted-foreground mb-2">
                  Project Details
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  value={formData.message}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Tell us about your project - vinyl color preferences, packaging needs, timeline, etc."
                />
              </div>

              {status === "success" ? (
                <div className="w-full px-8 py-4 bg-primary/10 border border-primary text-primary font-medium text-sm text-center">
                  ✓ Message sent! We&apos;ll be in touch soon.
                </div>
              ) : (
                <>
                  {status === "error" && (
                    <p className="text-sm text-red-400">{errorMsg || "Failed to send. Please try again."}</p>
                  )}
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="w-full px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-all inline-flex items-center justify-center gap-2 group glow-green hover:glow-green-strong rounded-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {status === "sending" ? "Sending..." : "Send Request"}
                    {status !== "sending" && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  )
}
