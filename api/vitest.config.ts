import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Las pruebas SIEMPRE usan .env.test, nunca tu base de desarrollo.
const { parsed } = config({ path: ".env.test", override: true, quiet: true });

export default defineConfig({
  test: {
    env: parsed,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/globalSetup.ts"],
    pool: "forks",
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
