# messages/

JSON message bundles consumed by [next-intl](https://next-intl.dev).

One file per locale, all sharing the same key tree. The active locale
is resolved in `app/i18n/request.ts` from the `NEXT_LOCALE` cookie.

| File          | Locale            | Notes                                                              |
| ------------- | ----------------- | ------------------------------------------------------------------ |
| `en-US.json`  | English (US)      | Default / source of truth. New strings land here first.            |
| `es-MX.json`  | Español (México)  | LatAm Spanish, manufacturing voice. Kimi K2.6 translation pass.    |

PR 1 only seeds the General Settings + avatar menu surfaces — the
broader app-wide string migration phases through follow-up PRs
(currency display helpers, date helpers, unit-system display
conversion in Konva/SVG + jsPDF, real FX).

Adding strings:
1. Edit `en-US.json` first.
2. Translate the same keys in `es-MX.json`.
3. Reference via `useTranslations("scope.subscope")` in client
   components or `getTranslations("scope.subscope")` in server
   components.
