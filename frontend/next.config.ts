import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { hostname: "workoscdn.com" },
    ],
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
