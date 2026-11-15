import { defineConfig } from "vitest/config";

/**
 * A dedicated Vitest config for Stryker's mutation testing (see stryker.config.json).
 *
 * It runs only the unit tests in test/unit — pure logic with no Postgres, no HTTP servers and no
 * spawned processes — so mutation testing needs no database (no TEST_DATABASE_URL), is fast and is
 * deterministic. It is not picked up by `pnpm test`, which loads vitest.config.ts.
 */
export default defineConfig({
  test: {
    testTimeout: 20_000,
    hookTimeout: 30_000,
    name: "unit",
    include: ["test/unit/**/*.test.ts"],
  },
});
