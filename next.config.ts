import type { NextConfig } from "next";

const isStaticBuild = process.env.ROUTA_BUILD_STATIC === "1";
const isDesktopServerBuild = process.env.ROUTA_DESKTOP_SERVER_BUILD === "1";
const isDesktopStandaloneBuild = process.env.ROUTA_DESKTOP_STANDALONE === "1";

// When set, proxy API requests to the Rust backend server (desktop mode without Node.js backend)
const rustBackendUrl = process.env.ROUTA_RUST_BACKEND_URL;

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during build to avoid circular structure error
    ignoreDuringBuilds: true,
  },
  typescript: {
    tsconfigPath: isDesktopServerBuild ? "tsconfig.desktop.json" : "tsconfig.json",
  },
  serverExternalPackages: [
    "@modelcontextprotocol/sdk",
    "@agentclientprotocol/sdk",
    "@anthropic-ai/claude-agent-sdk",
    "ws",
    "bufferutil",
    "utf-8-validate",
    "better-sqlite3",
  ],
  // Ensure cli.js (Claude Code agent binary) is included in Vercel's deployment
  // bundle. It's not statically imported so file-tracing won't pick it up
  // automatically; this forces Vercel to copy the whole SDK package.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@anthropic-ai/claude-agent-sdk/**/*",
      // Include skill definitions so Claude Code SDK can discover them on Vercel
      "./.claude/skills/**/*",
      "./.agents/skills/**/*",
    ],
  },
  ...(isDesktopServerBuild ? { distDir: ".next-desktop" } : {}),
  ...(isDesktopStandaloneBuild
    ? {
        output: "standalone",
        outputFileTracingIncludes: {
          "/api/**": ["./node_modules/@anthropic-ai/claude-agent-sdk/**/*"],
          "/*": ["./node_modules/better-sqlite3/**/*"],
        },
      }
    : {}),
  ...(isStaticBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {}),
  // Proxy /api/* to Rust backend when ROUTA_RUST_BACKEND_URL is set.
  // Uses beforeFiles to override local Next.js API routes.
  ...(rustBackendUrl
    ? {
        async rewrites() {
          return {
            beforeFiles: [
              {
                source: "/api/:path*",
                destination: `${rustBackendUrl}/api/:path*`,
              },
            ],
            afterFiles: [],
            fallback: [],
          };
        },
      }
    : {}),
};

export default nextConfig;
