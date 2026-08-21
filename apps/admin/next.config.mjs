/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The admin panel talks to the API via NEXT_PUBLIC_API_BASE_URL (default
  // http://localhost:4000/api). Rewrites let same-origin "/api-proxy/*" calls
  // reach the backend in dev without CORS friction if ever needed.
  async rewrites() {
    const target = process.env.API_INTERNAL_URL || 'http://localhost:4000';
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
