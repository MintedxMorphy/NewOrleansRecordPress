import type { Metadata } from 'next'
import { Cormorant_Garamond, DM_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const cormorantGaramond = Cormorant_Garamond({ 
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-sans'
});
const dmMono = DM_Mono({ 
  subsets: ["latin"],
  weight: ['400', '500'],
  variable: '--font-mono'
});

export const metadata: Metadata = {
  title: 'New Orleans Record Press | Custom Vinyl Pressing',
  description: 'New Orleans Record Press is the city\'s first and only independently owned vinyl record manufacturing plant. Custom vinyl pressing for 12" and 7" records.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${cormorantGaramond.variable} ${dmMono.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
