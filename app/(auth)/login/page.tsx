import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "../_components/login-form"
import { GoogleButton } from "../_components/social-auth/google-button"

export const metadata: Metadata = {
  title: "Sign in to RubberFit",
  description: "Sign in to the RubberFit manufacturing operations dashboard.",
  robots: {
    index: false,
    follow: false,
  },
}

interface LoginPageProps {
  searchParams?:
    | Promise<{
        error?: string | string[]
        redirectTo?: string | string[]
      }>
    | {
        error?: string | string[]
        redirectTo?: string | string[]
      }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const authError = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams?.error
  const redirectTo = Array.isArray(resolvedSearchParams?.redirectTo)
    ? resolvedSearchParams.redirectTo[0]
    : resolvedSearchParams?.redirectTo

  return (
    <>
      <div className="auth-corner">
        No account?{" "}
        <Link prefetch={false} href="/register" className="auth-link auth-link-strong ml-1">
          Register
        </Link>
      </div>

      <div>
        <span className="auth-eyebrow">Session login</span>
        <h1 className="auth-heading">Welcome back.</h1>

        {authError ? (
          <div className="auth-alert" role="alert" aria-live="polite">
            {authError}
          </div>
        ) : null}

        <GoogleButton redirectTo={redirectTo} />

        <div className="auth-divider" role="separator">
          <span className="auth-divider-line" aria-hidden="true" />
          <span className="auth-divider-text">Or</span>
          <span className="auth-divider-line" aria-hidden="true" />
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-[14px] text-[var(--color-graphite)]/60">
          New here?{" "}
          <a
            href="https://get.rubberfit.app/pricing"
            className="auth-link hover:text-[var(--color-signal)]"
          >
            Start your trial →
          </a>
        </p>
      </div>
    </>
  )
}
