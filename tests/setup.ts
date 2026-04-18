// tests/setup.ts
// Vitest loads this once per test-file worker (see vitest.config.ts::setupFiles).
// Stubs environment variables that infrastructure modules read at import time,
// so DI-touching tests don't crash on module evaluation.
// Real credentials never enter the test process.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key"
