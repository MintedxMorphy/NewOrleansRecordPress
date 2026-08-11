import { MarketingTheme } from "@/components/hoxton/marketing-theme"
import { Header } from "@/components/hoxton/header"
import { QuoteCalculator } from "@/components/quote-calculator"
import { Footer } from "@/components/hoxton/footer"

export const metadata = {
  title: "Get a Quote | New Orleans Record Press",
  description: "Calculate the cost of your custom vinyl pressing project. Get instant estimates for 12\" and 7\" records with various color and packaging options.",
}

export default function QuotePage() {
  return (
    <MarketingTheme>
      <Header />
      <main className="pt-40">
        <QuoteCalculator />
      </main>
      <Footer />
    </MarketingTheme>
  )
}
