import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    // Checks that TEST_DATABASE_URL names a Postgres server the tests may create databases and roles on.
    globalSetup: ["test/support/postgres-server.ts"],
  },
});
