import { Header } from "@/components/header"
import { QuoteCalculator } from "@/components/quote-calculator"
import { Footer } from "@/components/footer"

export const metadata = {
  title: "Get a Quote | New Orleans Record Press",
  description: "Calculate the cost of your custom vinyl pressing project. Get instant estimates for 12\" and 7\" records with various color and packaging options.",
}

export default function QuotePage() {
  return (
    <>
      <Header />
      <main className="pt-20">
        <QuoteCalculator />
      </main>
      <Footer />
    </>
  )
}
