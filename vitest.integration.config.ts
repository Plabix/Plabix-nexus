import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * End-to-end tests against a running app (real PostgreSQL + Ollama).
 * Start the app first (`npm run dev` or `npm start`), then: npm run test:integration
 * Target another URL with INTEGRATION_BASE_URL.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // Local CPU inference is slow; one file at a time, generous timeouts.
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
