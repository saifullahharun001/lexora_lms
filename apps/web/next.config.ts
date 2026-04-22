import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@lexora/config", "@lexora/types", "@lexora/ui"]
};

export default nextConfig;

