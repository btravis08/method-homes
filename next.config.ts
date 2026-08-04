import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* React Compiler: build-time auto-memoization — cuts re-render
     work across the motion-heavy component tree (INP/TBT) */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
};

export default nextConfig;
