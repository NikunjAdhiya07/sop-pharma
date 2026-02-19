/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pizzip', 'mammoth', 'pdf-parse', 'tesseract.js'],
  serverActions: {
    bodySizeLimit: '50mb',
  },
};

export default nextConfig;
