import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ['pdf-parse'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/staff',
        destination: '/staff/index.html',
      },
      {
        source: '/staff/pricing',
        destination: '/staff/pricing.html',
      },
      {
        source: '/staff/suppliers',
        destination: '/staff/suppliers.html',
      },
      {
        source: '/staff/plants',
        destination: '/staff/plants.html',
      },
      {
        source: '/staff/mastering',
        destination: '/staff/mastering.html',
      },
      {
        source: '/staff/inventory',
        destination: '/staff/inventory.html',
      },
      {
        source: '/staff/qc',
        destination: '/staff/qc.html',
      },
    ]
  },
}

export default nextConfig
