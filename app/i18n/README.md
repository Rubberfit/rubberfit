# i18n/

App-wide locale configuration for [next-intl](https://next-intl.dev).

| File           | Purpose                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `routing.ts`   | `LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, and the `isAppLocale` type guard. Single source of truth.      |
| `request.ts`   | `getRequestConfig` resolver. Reads `NEXT_LOCALE` cookie → loads the matching `messages/<locale>.json`.       |

PR 1 ships **cookie-only routing for the auth-gated dashboard** —
no `/es-MX/...` URL segments. The locale picker in the avatar menu
calls `app/actions/locale.ts::setLocale`, which writes the cookie
and revalidates `/dashboard`.

Adding a new locale:
1. Add the locale code to `LOCALES` in `routing.ts`.
2. Add `messages/<locale>.json` with the same key tree as `en-US.json`.
3. Add a switch-case branch in `nav-user.tsx::localeLabel` so the
   avatar menu has a translated label.

The next-intl plugin is wired in `next.config.mjs` pointing at
`./app/i18n/request.ts`; the root layout wraps children in
`<NextIntlClientProvider>` so client components see translations
without per-page setup.
