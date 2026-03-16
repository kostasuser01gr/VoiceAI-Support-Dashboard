import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Infrastructure files requiring live connections are excluded from unit
      // coverage. They are validated via integration/smoke tests (G5/G13).
      exclude: [
        "lib/db.ts",
        "lib/gemini.ts",
        "lib/runtime-state/redis.ts",
        "lib/integrations/providers/gmail-live.ts",
        "lib/prompts.ts",
        "tests/**",
        "coverage/**",
        "*.config.*",
        "app/**",
        "components/**",
      ],
      thresholds: {
        lines: 75,
        branches: 60,
        functions: 70,
        statements: 75,
      },
    },
  },
});
