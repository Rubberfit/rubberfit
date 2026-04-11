import { supabase } from "./supabase"

/**
 * Returns the current authenticated user's ID.
 * Throws if the user is not authenticated.
 */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error("Not authenticated")
  }

  return user.id
}
