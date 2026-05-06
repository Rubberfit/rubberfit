import { Suspense } from "react"

import { MfaChallengeForm } from "../_components/mfa-challenge-form"

/**
 * Standalone MFA challenge surface. Both the Google OAuth callback
 * and any future "session is aal1 but MFA is enrolled" redirect
 * land here. The login form's email+password path still challenges
 * inline; only OAuth (which can't prompt mid-redirect) needs a
 * dedicated page.
 */

interface PageProps {
  searchParams?:
    | Promise<{ redirectTo?: string | string[] }>
    | { redirectTo?: string | string[] }
}

export default async function MfaChallengePage({ searchParams }: PageProps) {
  const resolved = await Promise.resolve(searchParams)
  const redirectToRaw = Array.isArray(resolved?.redirectTo)
    ? resolved?.redirectTo[0]
    : resolved?.redirectTo
  const redirectTo = redirectToRaw ?? null

  return (
    <div>
      <span className="auth-eyebrow">Multi-factor auth</span>
      <h1 className="auth-heading">Verify identity.</h1>
      <Suspense fallback={null}>
        <MfaChallengeForm redirectTo={redirectTo} />
      </Suspense>
    </div>
  )
}
