/**
 * PDF branding constants. Lives in `src/application` (no `"use server"`)
 * so both server actions and client components can import without
 * violating Next.js's rule that every export of a `"use server"`
 * module must be an async function. The Vercel bundler rejected the
 * whole `app/actions/branding.ts` module in v2.0.0's first deploy
 * because this string constant rode alongside the action — split now.
 */

export const DEFAULT_PDF_COMPANY_NAME = "Rubberfit"
