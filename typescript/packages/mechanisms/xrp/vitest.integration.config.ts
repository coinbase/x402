import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ""),
    include: ["test/integrations/**/*.test.ts"],
    testTimeout: 60000, // 60 seconds for integration tests
  },
  plugins: [tsconfigPaths({ projects: ["."] })],
}));
