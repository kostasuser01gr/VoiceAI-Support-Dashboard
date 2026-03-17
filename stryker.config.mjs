// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  // Mutate only security-critical and core business logic files
  mutate: [
    "lib/auth.ts",
    "lib/rbac.ts",
    "lib/ssrf.ts",
    "lib/safety.ts",
    "lib/verifier.ts",
    "lib/rateLimit.ts",
    "lib/idempotency.ts",
  ],
  vitest: {
    configFile: "vitest.config.ts",
  },
  reporters: ["progress", "clear-text", "json"],
  jsonReporter: {
    fileName: "reports/mutation/mutation.json",
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 55,
  },
  coverageAnalysis: "perTest",
  timeoutMS: 30000,
  concurrency: 4,
  disableTypeChecks: true,
};
export default config;
