import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id: rawId } = await params
  const cutId = parseInt(rawId, 10)

  if (isNaN(cutId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 })
  }

  // Fetch the cut record so we can check ownership for cutter self-delete
  const { data: cut, error: fetchError } = await supabase
    .from("cut_history")
    .select("id, user_id")
    .eq("id", cutId)
    .single()

  if (fetchError || !cut) {
    return NextResponse.json({ error: "Cut record not found" }, { status: 404 })
  }

  // Resolve caller role
  const { data: profile } = await supabase
    .from("profiles")
    .select("roles")
    .eq("id", user.id)
    .single()

  const roles: string[] = (profile?.roles as string[] | null) ?? []
  const isPrivileged = roles.includes("admin") || roles.includes("manager")
  const isOwnRecord = cut.user_id === user.id
  const isCutter = roles.includes("cutter")

  // Allow: admins/managers can delete any; cutters can only delete their own
  if (!isPrivileged && !(isCutter && isOwnRecord)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { error } = await supabase.from("cut_history").delete().eq("id", cutId)

  if (error) {
    console.error("cut_history delete error:", error)
    return NextResponse.json({ error: "Failed to delete cut record" }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
