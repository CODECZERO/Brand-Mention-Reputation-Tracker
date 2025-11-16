import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.resolve(__dirname, "./src/setup/testEnvironment.ts"), path.resolve(__dirname, "./src/reporting/summary.ts")],
    hookTimeout: 120_000,
    testTimeout: 120_000,
    teardownTimeout: 60_000,
    reporters: ["default"],
    coverage: {
      enabled: false,
    },
  },
  resolve: {
    conditions: ["node", "import"],
    extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
    alias: {
      "@tests": path.resolve(__dirname, "./src"),
    },
  },
});
