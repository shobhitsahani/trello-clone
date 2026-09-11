/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:4002/v1/:path*",
      },
    ];
  },
};

export default nextConfig;