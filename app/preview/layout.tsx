import type { Metadata } from "next"
import { Montserrat } from "next/font/google"

// Hoxton Vinyl uses Montserrat as its primary typeface.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-preview-display",
})

const montserratBody = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-preview-body",
})

export const metadata: Metadata = {
  title: "NORP — Redesign Preview",
  description: "Hoxton-inspired redesign mockup for New Orleans Record Press. Preview only.",
  robots: { index: false, follow: false },
}

export default function PreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      className={`${montserrat.variable} ${montserratBody.variable} min-h-screen bg-white text-[#141414]`}
      style={{ fontFamily: "var(--font-preview-body), system-ui, sans-serif" }}
    >
      {children}
    </div>
  )
}
