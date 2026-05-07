import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  experimental: {
    middlewareClientMaxBodySize: 52428800, // 50MB
  },
};

export default nextConfig;
