import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lekdajfvpcxezlvfgzua.supabase.co' },
    ],
  },
  serverExternalPackages: ['pptxgenjs', 'jszip', 'xml2js', 'xlsx'],
}

export default nextConfig
