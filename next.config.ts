import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 blocks dev resources (HMR, hydration) from an origin other than localhost.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
