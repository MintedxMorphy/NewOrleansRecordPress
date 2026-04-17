import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Shop | New Orleans Record Press',
  description: 'Records and merch from New Orleans Record Press.',
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
