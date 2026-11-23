/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep these server-only packages out of the webpack bundle
    serverComponentsExternalPackages: ['bullmq', 'ioredis', '@prisma/client', 'cheerio'],
  },
};

export default nextConfig;
