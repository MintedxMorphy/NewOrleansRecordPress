/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
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
    ]
  },
}

export default nextConfig
