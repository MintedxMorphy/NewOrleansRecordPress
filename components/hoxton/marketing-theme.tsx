import type { CSSProperties } from "react"
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

/**
 * Scoped light theme for the public marketing pages.
 *
 * These override the global (dark) design tokens ONLY within this wrapper's
 * subtree, so existing token-based pages (quote calculator, vinyl colors,
 * team, story, resources) render on the light Hoxton palette without needing
 * every utility class rewritten. The dark theme used by the dashboard, admin
 * and staff tools is untouched.
 */
const lightTokens: CSSProperties = {
  ["--background" as string]: "#ffffff",
  ["--foreground" as string]: "#141414",
  ["--card" as string]: "#f4f4f4",
  ["--card-foreground" as string]: "#141414",
  ["--popover" as string]: "#ffffff",
  ["--popover-foreground" as string]: "#141414",
  ["--primary" as string]: "#2779a7",
  ["--primary-foreground" as string]: "#ffffff",
  ["--secondary" as string]: "#f0f0f0",
  ["--secondary-foreground" as string]: "#141414",
  ["--muted" as string]: "#f2f2f2",
  ["--muted-foreground" as string]: "#6b7280",
  ["--accent" as string]: "#2779a7",
  ["--accent-foreground" as string]: "#ffffff",
  ["--border" as string]: "#e5e5e5",
  ["--input" as string]: "#e5e5e5",
  ["--ring" as string]: "#2779a7",
  fontFamily: "var(--font-preview-body), system-ui, sans-serif",
}

export function MarketingTheme({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${montserratBody.variable} min-h-screen bg-white text-[#141414]`}
      style={lightTokens}
    >
      {children}
    </div>
  )
}
