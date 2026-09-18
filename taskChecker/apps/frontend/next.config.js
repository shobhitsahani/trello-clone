/** @type {import('next').NextConfig} */
const nextConfig = {
  // Barrel icon file (components/icons.tsx) otherwise lands whole in the
  // shell bundle — transpile/optimize it per-import.
  experimental: {
    optimizePackageImports: ["@/components/icons"],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:4002/v1/:path*",
      },
      {
        source: "/v1/:path*",
        destination: "http://localhost:4002/v1/:path*",
      },
    ];
  },
};

export default nextConfig;