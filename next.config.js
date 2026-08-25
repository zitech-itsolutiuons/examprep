/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb', // allow CSV question imports
    },
  },
};

module.exports = nextConfig;
