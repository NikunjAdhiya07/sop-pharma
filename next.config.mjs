/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    serverExternalPackages: ['pizzip', 'mammoth', 'pdf-parse', 'tesseract.js'],
  },
};

export default nextConfig;
