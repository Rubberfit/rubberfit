import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

/** GET /api/users
 *  Returns a list of users (id + full_name) for the admin / manager / supervisor dropdown.
 *  Restricted to callers who hold one of those three roles.
 *  Response: { data: { id: string; full_name: string | null }[] }
 */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase environment variables are missing" }, { status: 503 })
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()

  const roles: string[] = (profile?.roles as string[] | null) ?? []
  const isPrivileged =
    roles.includes("admin") || roles.includes("manager") || roles.includes("supervisor")

  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name", { ascending: true })

  if (error) {
    console.error("users GET error:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }

  return NextResponse.json({
    data: (data ?? []) as { id: string; full_name: string | null; email: string | null }[],
  })
}
