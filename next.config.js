/** @type {import('next').NextConfig} */
const nextConfig = {
  // Deliberately empty.
  //
  // Do NOT set `output: 'standalone'` here. That mode exists for self-hosting (Docker),
  // where you want a copyable server bundle. On Vercel the Next.js builder produces its
  // own serverless output, and pointing it at a standalone bundle breaks the deployment.
  //
  // Do NOT set `output: 'export'` either — this app has API routes, middleware, and
  // server-rendered pages that read the database, none of which survive a static export.
}

module.exports = nextConfig
