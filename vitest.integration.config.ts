// vitest.integration.config.ts
//
// Integration tests run against a real local Supabase stack. They live
// at `tests/integration/**` and require:
//   1. `npm run supabase:start` — Supabase listening on :54321
//   2. `npm run supabase:reset` — the current seed.sql has been applied
//
// `environment: node` instead of `happy-dom` so the Supabase JS client
// runs against real fetch/WebSocket. The unit-test config at
// `vitest.config.ts` excludes `tests/integration/**` so these don't
// fire under `npm run test`.
import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Run sequentially against shared seed state; parallelism isn't
    // worth the determinism trade-off for a small integration surface.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
})
