/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep these server-only packages out of the webpack bundle
    serverComponentsExternalPackages: ['bullmq', 'ioredis', '@prisma/client', 'cheerio', 'pdfkit'],

    // PDFKit loads its fonts with dynamic requires, which Vercel's file tracer cannot see.
    // Without this the PDF routes work locally but fail on Vercel with "Cannot find module".
    outputFileTracingIncludes: {
      '/api/audit/[id]/pdf': ['./node_modules/pdfkit/js/**/*'],
      '/api/cron/audits': ['./node_modules/pdfkit/js/**/*'],
    },
  },
};

export default nextConfig;
