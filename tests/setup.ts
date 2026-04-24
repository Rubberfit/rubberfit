// tests/setup.ts
// Vitest loads this once per test-file worker (see vitest.config.ts::setupFiles).
// Intentionally empty — the Supabase client is now lazy-init'd (see
// src/infrastructure/models/supabase.ts), so importing infrastructure modules
// no longer requires env stubs. Tests that actually build a Supabase client
// must set the env vars themselves in beforeEach/beforeAll.
