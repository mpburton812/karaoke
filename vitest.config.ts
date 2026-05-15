import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["server/**/*.test.ts", "src/**/*.test.ts"],
    env: {
      JWT_SECRET: "test-jwt-secret-for-vitest-only",
    },
  },
});
