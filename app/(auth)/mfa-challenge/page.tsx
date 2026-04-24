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
    <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
      <div className="space-y-2 text-center">
        <h1 className="font-medium text-3xl">Verification needed</h1>
        <p className="text-muted-foreground text-sm">
          Enter the 6-digit code from your authenticator app to finish signing in.
        </p>
      </div>
      <Suspense fallback={null}>
        <MfaChallengeForm redirectTo={redirectTo} />
      </Suspense>
    </div>
  )
}
