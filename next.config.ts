import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@modelcontextprotocol/sdk",
    "@agentclientprotocol/sdk",
    "ws",
    "bufferutil",
    "utf-8-validate",
  ],
};

export default nextConfig;
