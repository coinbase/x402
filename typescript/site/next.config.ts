import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/api/stats",
        headers: [
          {
            key: "Cache-Control",
            value: "s-maxage=300, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/build",
        destination: "/build-with-us",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/protocol",
        destination: "/",
        permanent: false,
      },
      {
        source: "/foundation",
        destination: "/",
        permanent: false,
      },
      {
        source: "/build",
        destination: "/",
        permanent: false,
      },
      {
        source: "/build-with-us",
        destination: "/",
        permanent: false,
      },
    ];
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    return config;
  },
};

export default nextConfig;
