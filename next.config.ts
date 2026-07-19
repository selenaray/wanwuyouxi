import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.43.*"],
  devIndicators: false,
  serverExternalPackages: ["ali-oss"],
};

export default nextConfig;
