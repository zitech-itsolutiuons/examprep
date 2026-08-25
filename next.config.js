
// const nextConfig = {
//   reactStrictMode: true,
//   experimental: {
//     serverActions: {
//       bodySizeLimit: '5mb', // allow CSV question imports
//     },
//   },
// };

// module.exports = nextConfig;


/** @type {import('next').NextConfig} */
const nextConfig = {
  // For server deployment (with database)
  output: 'standalone',
  // For static export (no database)
  // output: 'export',
}

module.exports = nextConfig
