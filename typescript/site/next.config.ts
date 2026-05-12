import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const configPath = fileURLToPath(import.meta.url);
const configDir = path.dirname(configPath);

/**
 * Absolute path to the `site` workspace package (where `package.json` name is `"site"`).
 * Next.js 16 Turbopack validates `next/package.json` from this root; it must not resolve to
 * `app/` or other subfolders. We discover it explicitly because `import.meta.url` for this
 * config can differ when Next compiles the config, and `pnpm` may run the script with cwd at
 * the workspace root.
 *
 * @returns Absolute filesystem path to the package named `"site"`
 */
function resolveSitePackageRoot(): string {
  const tryDirs = [process.cwd(), configDir];
  for (const dir of tryDirs) {
    const resolved = path.resolve(dir);
    const pkgPath = path.join(resolved, "package.json");
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
      if (pkg.name === "site") {
        return resolved;
      }
    } catch {
      /* ignore invalid package.json */
    }
  }

  let dir = configDir;
  for (let i = 0; i < 24; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: string };
        if (pkg.name === "site") {
          return dir;
        }
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return path.resolve(configDir);
}

const sitePackageRoot = resolveSitePackageRoot();

const nextConfig: NextConfig = {
  // @aptos-labs/ts-sdk uses native crypto and other Node.js APIs that conflict with Next.js bundling
  // Its transitive dependencies (got, keyv, cacheable-request) also need to be externalized
  serverExternalPackages: [
    "@aptos-labs/ts-sdk",
    "@aptos-labs/aptos-client",
    "got",
    "keyv",
    "cacheable-request",
  ],
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
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</.well-known/api-catalog>; rel="api-catalog", </writing>; rel="service-doc", </protected>; rel="payment-required"',
          },
          {
            key: "X-X402-Supported",
            value: "true",
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
      {
        source: "/.well-known/api-catalog",
        destination: "/api/well-known/api-catalog",
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
  /**
   * Must match `turbopack.root` in Next.js 16+ or Turbopack uses one value and breaks
   * resolution / inference.
   */
  outputFileTracingRoot: sitePackageRoot,
  turbopack: {
    /**
     * Must be the `site` package directory (`typescript/site`), not `app/` or the pnpm
     * workspace root. Workspace deps live under `site/node_modules/@x402/*`.
     */
    root: sitePackageRoot,
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
