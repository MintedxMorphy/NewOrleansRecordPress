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
    ]
  },
}

export default nextConfig
