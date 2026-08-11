import { MarketingTheme } from "@/components/hoxton/marketing-theme"
import { Header } from "@/components/hoxton/header"
import { Footer } from "@/components/hoxton/footer"
import { ResourcesPage } from "@/components/resources-page"

export const metadata = {
  title: "Resources | New Orleans Record Press",
  description:
    "FAQ and downloadable artwork templates for vinyl pressing at New Orleans Record Press. Center labels, jackets, inserts, and more.",
}

export default function ResourcesRoutePage() {
  return (
    <MarketingTheme>
      <Header />
      <main className="pt-40 pb-20 bg-background">
        <ResourcesPage />
      </main>
      <Footer />
    </MarketingTheme>
  )
}
