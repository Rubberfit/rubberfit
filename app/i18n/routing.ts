/**
 * Locale configuration for next-intl.
 *
 * PR 1 ships cookie-only locale routing for the auth-gated dashboard:
 * `localePrefix: "never"` means no `/es-MX/...` URL segments. The
 * resolved locale lives in the `NEXT_LOCALE` cookie and is read by
 * `app/i18n/request.ts` on every request. Picking a locale in the
 * avatar menu calls a server action that sets the cookie and triggers
 * a revalidation.
 *
 * Public marketing pages (rubberfit-marketing) can adopt URL-prefix
 * routing separately when they ship localized content.
 *
 * Spanish target dialect is es-MX (LatAm manufacturing). Add new
 * locales here + drop a matching JSON file in /messages.
 */
export const LOCALES = ["en-US", "es-MX"] as const

export type AppLocale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = "en-US"

export const LOCALE_COOKIE = "NEXT_LOCALE"

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}
