import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["**.replit.dev", "**.replit.app", "127.0.0.1"],
};

export default nextConfig;
