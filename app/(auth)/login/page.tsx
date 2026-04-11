import Link from "next/link"

import { Globe } from "lucide-react"

import { APP_CONFIG } from "@/config/app-config"

import { LoginForm } from "../_components/login-form"
import { GoogleButton } from "../_components/social-auth/google-button"

interface LoginV2Props {
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

export default async function LoginV2({ searchParams }: LoginV2Props) {
  const resolvedSearchParams = await Promise.resolve(searchParams)
  const authError = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams.error[0]
    : resolvedSearchParams?.error
  const redirectTo = Array.isArray(resolvedSearchParams?.redirectTo)
    ? resolvedSearchParams.redirectTo[0]
    : resolvedSearchParams?.redirectTo

  return (
    <>
      <div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
        <div className="space-y-2 text-center">
          <h1 className="font-medium text-3xl">Login to your account</h1>
          <p className="text-muted-foreground text-sm">Please enter your details to login.</p>
        </div>
        <div className="space-y-4">
          {authError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-destructive text-sm">
              {authError}
            </div>
          ) : null}
          <GoogleButton className="w-full" redirectTo={redirectTo} />
          <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
            <span className="relative z-10 bg-background px-2 text-muted-foreground">
              Or continue with
            </span>
          </div>
          <LoginForm redirectTo={redirectTo} />
        </div>
      </div>

      <div className="absolute top-5 flex w-full justify-end px-10">
        <div className="text-muted-foreground text-sm">
          Don&apos;t have an account?{" "}
          <Link prefetch={false} className="text-foreground" href="register">
            Register
          </Link>
        </div>
      </div>

      <div className="absolute bottom-5 flex w-full justify-between px-10">
        <div className="text-sm">{APP_CONFIG.copyright}</div>
        <div className="flex items-center gap-1 text-sm">
          <Globe className="size-4 text-muted-foreground" />
          ENG
        </div>
      </div>
    </>
  )
}
