import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "192.168.43.*", "*.r3.cpolar.top"],
  devIndicators: false,
  serverExternalPackages: ["ali-oss", "@electric-sql/pglite"],
};

export default nextConfig;
