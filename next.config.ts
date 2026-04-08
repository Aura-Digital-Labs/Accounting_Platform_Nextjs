import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "10.7.74.15",
    "*.10.7.74.15",
    "localhost:3000",
    "127.0.0.1:3000",
    "10.7.74.15:3000",
  ],
};

export default nextConfig;
