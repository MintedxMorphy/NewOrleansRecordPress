"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Download, FileText, Mail } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { FAQ_ITEMS, TEMPLATE_INTRO, TEMPLATE_SECTIONS } from "@/lib/resources-content"

const SECTIONS = [
  { id: "templates", label: "Templates" },
  { id: "faq", label: "FAQ" },
] as const

function FaqAnswer({ html }: { html: string }) {
  return (
    <div
      className="resources-prose text-muted-foreground leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_b]:text-foreground [&_p]:mt-4 [&_p:first-child]:mt-0 [&_i]:text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function TemplateDownloadCard({ label, href }: { label: string; href: string }) {
  const filename = href.split("/").pop() || "template.pdf"

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={filename}
      className="group flex items-start gap-4 border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-secondary/40"
    >
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 text-primary">
        <FileText size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{label}</p>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">PDF Download</p>
      </div>
      <Download size={16} className="mt-1 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
    </a>
  )
}

export function ResourcesPage() {
  const [activeSection, setActiveSection] = useState<(typeof SECTIONS)[number]["id"]>("templates")

  useEffect(() => {
    const hash = window.location.hash.replace("#", "")
    if (hash === "faq" || hash === "templates") {
      setActiveSection(hash)
    }
  }, [])

  const scrollToSection = (id: (typeof SECTIONS)[number]["id"]) => {
    setActiveSection(id)
    window.history.replaceState(null, "", `#${id}`)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <div className="max-w-7xl mx-auto px-6">
      <div className="text-center mb-12">
        <p className="text-primary font-mono text-sm uppercase tracking-[0.3em] mb-4">Resources</p>
        <h1 className="text-4xl md:text-5xl font-bold uppercase tracking-tight mb-6">Templates & FAQ</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Artwork templates to guarantee your project prints at the highest quality, plus frequently asked questions about pressing at NORP.
        </p>
      </div>

      <div className="sticky top-[73px] z-40 -mx-6 mb-12 border-b border-border bg-background/95 px-6 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl gap-2 py-4">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={`px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors rounded-lg ${
                activeSection === section.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      <section id="templates" className="scroll-mt-36 mb-24">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight">Templates</h2>
          <p className="mt-3 text-muted-foreground max-w-3xl">
            Template files to guarantee your art is printed at the highest quality.
          </p>
        </div>

        <div className="space-y-8 mb-12">
          <div className="border border-border bg-card p-6 md:p-8">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4">Artwork Specifications</h3>
            <p className="text-muted-foreground leading-relaxed">{TEMPLATE_INTRO.artworkSpecs}</p>
          </div>
          <div className="border border-border bg-card p-6 md:p-8">
            <h3 className="text-lg font-bold uppercase tracking-wider mb-4">Submitting Art</h3>
            <p className="text-muted-foreground leading-relaxed">{TEMPLATE_INTRO.submittingArt}</p>
          </div>
        </div>

        <div className="space-y-12">
          {TEMPLATE_SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="text-xl font-bold uppercase tracking-wider mb-6 border-b border-border pb-4">
                {section.title}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {section.downloads.map((download) => (
                  <TemplateDownloadCard key={download.href} label={download.label} href={download.href} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-muted-foreground mb-6">
            Ready to start your project? Configure options and get an instant estimate.
          </p>
          <Link
            href="/quote"
            className="inline-flex px-8 py-4 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors"
          >
            Get a Quote
          </Link>
        </div>
      </section>

      <section id="faq" className="scroll-mt-36 pb-8">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight">FAQ</h2>
          <p className="mt-3 text-muted-foreground max-w-3xl">
            Frequently asked questions about pressing at NORP.
          </p>
        </div>

        <div className="border border-border bg-card">
          <Accordion type="single" collapsible className="px-4 md:px-6">
            {FAQ_ITEMS.map((item, index) => (
              <AccordionItem key={item.question} value={`faq-${index}`}>
                <AccordionTrigger className="text-base font-bold uppercase tracking-wide hover:no-underline hover:text-primary">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <FaqAnswer html={item.answerHtml} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="mt-10 border border-border bg-secondary/40 p-6 md:p-8 text-center">
          <p className="text-muted-foreground mb-4">
            Have a question not answered above? Need some extra guidance on making your project a reality?
          </p>
          <a
            href="mailto:info@neworleansrecordpress.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-wider text-sm hover:bg-primary/90 transition-colors"
          >
            <Mail size={16} />
            Email Us
          </a>
        </div>
      </section>
    </div>
  )
}
