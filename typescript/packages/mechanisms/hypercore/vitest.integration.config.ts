import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ""),
    include: ["test/integrations/**/*.test.ts"],
  },
  plugins: [tsconfigPaths({ projects: ["."] })],
}));
