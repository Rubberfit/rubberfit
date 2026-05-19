import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

import { DEFAULT_LOCALE, LOCALE_COOKIE, isAppLocale } from "./routing"

/**
 * Per-request locale resolver. Reads `NEXT_LOCALE` from cookies and
 * falls back to the default locale when missing or unknown. The
 * resolved locale + the matching message bundle is then available
 * via `useTranslations` / `useLocale` everywhere.
 *
 * Messages are loaded dynamically per locale so unused bundles aren't
 * shipped on every request. New locales: add to LOCALES in
 * `./routing.ts` and create the matching JSON file in `/messages`.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isAppLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE
  const messages = (await import(`@/messages/${locale}.json`)).default
  return { locale, messages }
})
