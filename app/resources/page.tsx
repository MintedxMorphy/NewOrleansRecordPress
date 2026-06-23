import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { ResourcesPage } from "@/components/resources-page"

export const metadata = {
  title: "Resources | New Orleans Record Press",
  description:
    "FAQ and downloadable artwork templates for vinyl pressing at New Orleans Record Press. Center labels, jackets, inserts, and more.",
}

export default function ResourcesRoutePage() {
  return (
    <>
      <Header />
      <main className="pt-24 pb-20 bg-background">
        <ResourcesPage />
      </main>
      <Footer />
    </>
  )
}
