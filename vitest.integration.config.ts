import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    setupFiles: ["./tests/integration/setup.ts"],
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
