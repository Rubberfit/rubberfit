"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"

import { LOCALE_COOKIE, isAppLocale, type AppLocale } from "@/app/i18n/routing"

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 // 1 year

export type SetLocaleResult = { ok: true; locale: AppLocale } | { ok: false; error: "invalid" }

export interface SetLocaleInput {
  locale: string
}

/**
 * Persists the user's locale choice in the `NEXT_LOCALE` cookie and
 * triggers a re-render of the dashboard tree so server-rendered copy
 * picks up the new bundle on next nav. The cookie is `Lax` so it
 * survives same-site navigation but isn't sent on cross-site requests.
 *
 * Intentionally NOT gated on `requireAuthenticatedUser` — locale is
 * also valid for unauthenticated marketing surfaces, and the cookie
 * write has no security impact.
 *
 * Intentionally does NOT call `ensureDatabaseFactoryRegistered()` —
 * this action only writes a cookie and triggers revalidation; no
 * Supabase calls happen here.
 */
export async function setLocale(input: SetLocaleInput): Promise<SetLocaleResult> {
  if (!isAppLocale(input.locale)) return { ok: false, error: "invalid" }
  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, input.locale, {
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    path: "/",
    httpOnly: false,
  })
  revalidatePath("/dashboard", "layout")
  return { ok: true, locale: input.locale }
}
