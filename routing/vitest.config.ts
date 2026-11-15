import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // Pure logic: no Postgres, no HTTP servers, no spawned processes. Also what Stryker runs (vitest.stryker.config.ts).
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/**/*.test.ts"],
          exclude: ["test/unit/**"],
          // Checks that TEST_DATABASE_URL names a Postgres server the tests may create databases and roles on.
          globalSetup: ["test/support/postgres-server.ts"],
        },
      },
    ],
  },
});
