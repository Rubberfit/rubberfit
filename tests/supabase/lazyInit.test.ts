import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

describe("Supabase client lazy-init", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  beforeEach(() => {
    vi.resetModules()
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  })

  afterEach(() => {
    if (originalUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  })

  it("module imports successfully with env absent", async () => {
    await expect(import("@/src/infrastructure/models/supabase")).resolves.toBeDefined()
  })

  it("getSupabaseClient() throws only when called without env", async () => {
    const mod = await import("@/src/infrastructure/models/supabase")
    if (typeof (mod as { getSupabaseClient?: unknown }).getSupabaseClient === "function") {
      expect(() => (mod as { getSupabaseClient: () => unknown }).getSupabaseClient()).toThrow(
        /supabase/i
      )
    } else {
      expect(() =>
        (mod as { supabase: { from: (t: string) => unknown } }).supabase.from("rolls")
      ).toThrow(/supabase/i)
    }
  })

  it("getSupabaseClient() returns a client when env is set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321"
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
    const mod = await import("@/src/infrastructure/models/supabase")
    if (typeof (mod as { getSupabaseClient?: unknown }).getSupabaseClient === "function") {
      const client = (mod as { getSupabaseClient: () => unknown }).getSupabaseClient()
      expect(client).toBeDefined()
      expect(typeof (client as { from: unknown }).from).toBe("function")
    } else {
      const client = (mod as { supabase: { from: (t: string) => unknown } }).supabase
      expect(typeof client.from).toBe("function")
    }
  })
})
