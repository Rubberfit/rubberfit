"use server"

import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { profileRepository } from "@/src/infrastructure/repositories/profiles.repository"

/**
 * Self-delete action.
 *
 * Notable shape choices:
 *
 *   1. **No input.** The previous browser path was
 *      `profileService.requestSelfDelete(user.id)`, where the userId
 *      came from `useAuth().user.id`. The action takes no caller-
 *      supplied userId — the target IS the actor, resolved server-
 *      side from the session cookie. ASVS V4.2: identity-bearing
 *      arguments come from the authenticated session, not from
 *      caller input.
 *
 *   2. **No permission check.** Any authenticated user can delete
 *      their own account. Authentication itself is the only
 *      authorization.
 *
 *   3. **Typed return, not throw.** The card's UX distinguishes
 *      "delete failed, please contact support" (toast + stay on
 *      page) from happy path (toast + sign out + redirect). A
 *      typed `{ ok, error }` return preserves that distinction
 *      cleanly across the action RPC boundary, which loses error
 *      prototype chains. Auth/config failures still throw — those
 *      reach the surrounding try/catch in the card.
 *
 *   4. **No revalidatePath.** The user is about to be redirected
 *      out of the app. Revalidating any dashboard route is a no-op.
 *
 *   5. **No server-side sign-out.** Cookie cleanup needs to happen
 *      via the browser-side `supabase.auth.signOut()` so its
 *      `onAuthStateChange` listeners run and React state stays in
 *      sync. The action persists the soft-delete; the client chains
 *      `await signOut()` immediately on success — no setTimeout
 *      race. Even if signOut later fails, the soft-deleted profile
 *      is rejected by `proxy.ts` and the auth callback on next
 *      request, so the account is unusable regardless.
 *
 *   6. **Sanitized error.** Raw Supabase / repository errors are
 *      logged server-side; the client receives a stable message.
 *      ASVS V7.4 (no information disclosure in error messages).
 */
export async function requestSelfDelete(): Promise<{ ok: true } | { ok: false; error: string }> {
  // Self-delete is intentionally recovery-exempt: a user whose subscription
  // has lapsed is locked out of the dashboard by the proxy gate and must
  // still be able to close their account. Authentication is the only
  // authorization required — there is no `requireActiveSubscription` here.
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()

  const result = await profileRepository.requestSelfDelete(actor.id)
  if (!result.success) {
    console.error("[self-delete] persist failed:", result.error)
    return {
      ok: false,
      error: "Could not delete your account. Please contact support.",
    }
  }
  return { ok: true }
}
