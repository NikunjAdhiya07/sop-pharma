/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pizzip', 'mammoth', 'pdf-parse', 'tesseract.js'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
};

export default nextConfig;
