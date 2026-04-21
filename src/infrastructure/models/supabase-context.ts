import { createBrowserClient } from "@supabase/ssr"
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables")
}

// Database context
//
// Pinned to globalThis in dev so HMR re-evaluations reuse a single
// GoTrue auth instance. Without this, each hot-reload creates a new
// client whose background refresh timer competes for the same Web
// Lock on the auth token, causing authenticated requests to hang.
// In production the if-block is dead-code-eliminated and only one
// client is ever created per page load.
function createSupabaseClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      debug: process.env.NODE_ENV === "development",
    },
  })
}

const globalRef = globalThis as unknown as {
  __supabaseClient?: ReturnType<typeof createSupabaseClient>
}

export const supabase = globalRef.__supabaseClient ?? createSupabaseClient()

if (process.env.NODE_ENV !== "production") {
  globalRef.__supabaseClient = supabase
}
