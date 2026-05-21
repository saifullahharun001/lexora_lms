import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lexora/config", "@lexora/types", "@lexora/ui"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost/api/v1/:path*"
      }
    ];
  }
};

export default nextConfig;
