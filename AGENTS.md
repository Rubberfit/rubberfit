# AGENTS.md

# CLAUDE

- Claude, if you're reading this, skip this file and go to the .claude directory.

# Expectations

- In all interactions and commit messages, be extremely concise.
- When prompted for large tasks, always formulate a multi-part plan to be executed in phases.
- Provide the pros and cons for design implementations.
- Once prompted to execute plan, provide code changes.
- When creating new files, return here and update the "Project Structure".

# Rules

- Next JS related files must go in the app directory.
- Take into consideration of the boundary lines of the clean architecture when making changes to files.

## Project Structure

- src/
  - Clean architecture styled directory
  - application/
    - services/ — service interfaces
    - repositories/ — repository interfaces
    - use-cases/ — business-logic orchestrators (complex ops only; pure CRUD skips this layer)
  - entities/
    - Models and custom errors
  - infrastructure/
    - services/ and repositories/ — Supabase-backed implementations
      - `rollBarcodeAssetService.ts` — stores generated roll barcode PNGs in Supabase Storage and stamps barcode metadata onto `rolls`
    - supabase/ — generated types + SQL migrations
      - `migrations/20260421000002_roll_barcodes_and_scan_pdf.sql` — roll barcode asset columns + `roll-barcodes` storage bucket
  - interface-adapters/
    - Reserved for controllers. Stays empty — server actions in `app/actions/<domain>.ts` fill the controller role.

- app/
  - Frameworks & Drivers Layer — Next.js pages, hooks, components, styles
  - `actions/<domain>.ts` — server actions ("use server"). One file per domain (`purchase-orders.ts`, `reorder.ts`, `users.ts`, `materials.ts`, `inventory.ts`, `profile.ts`). Each export is a hard server-only entrypoint that callers `await` from client code. Public input is `Omit<UseCaseInput, "actor">` so clients can't spoof identity.
  - `server/auth/` — `requireAuthenticatedUser`, `requirePermission`, and the three typed error classes. Plain functions, NOT registered in TSyringe (request-scoped auth must not enter a singleton container).
  - `server/database/register-factory.ts` — installs the cookie-bound `getDatabaseClient` factory. Server actions call `ensureDatabaseFactoryRegistered()` as their first line.
  - `r/[partNumber]/pdf/route.ts` — public roll-info PDF response used by printed QR labels
  - `dashboard/cutting-engine/_components/cut-load-utils.ts` — pure helpers that hydrate a `cut_history` row back into the cutting engine (per-template partType, dimensions, quantities). Extracted for unit-testability; consumed by `page.tsx` `handleLoadCut`.
  - `lib/pdf/` — Phase 7 shared PDF design system (tokens, chrome, primitives, pagination). Pure jsPDF — no DOM access. Composed by every per-PDF builder under `app/dashboard/**/_components/*-pdf.ts` and the `app/r/**` + `app/api/cuts/**` routes. Purity guarded by `tests/pdf/chrome-purity.test.ts`.

- .claude/
  - handoff/ — task briefs and second-opinion assignments
  - research/ — investigation notes and reports

- proxy.ts — Next.js request proxy for dashboard auth and permission gating
- nesting/ — 2D nesting engine
- di/ — TSyringe DI registration

## Data Flow

- Simple (pure CRUD): `app/ hook → infrastructure service → Supabase`
- Orchestrated (rules/side effects/auth-bound): `app/ hook → app/actions/<domain>.ts → src/application/use-cases/ → service(s) → Supabase`. Each action calls `requireAuthenticatedUser()` + `requirePermission(actor, ...)` from `app/server/auth/` then resolves the use-case via DI. The `actor: ActionActor` field on use-case inputs threads caller identity through (no global `getCurrentUserId` lookup). Public action input is `Omit<UseCaseInput, "actor">` — clients can't spoof identity. Three error classes: `UnauthorizedError` (401), `ForbiddenError` (403), `AuthConfigError` (5xx).
- Hooks own UI concerns (toast, router, loading). Actions enforce auth + RBAC. Use-cases own business logic (tax calc, cross-service coordination, notifications).
- Use-cases are TSyringe-registered. Classes use `@injectable()` + `@inject(TOKEN)`; the action layer resolves them via `resolveUseCase<IFoo>(TOKENS.IFoo)` from `@/di/resolve`. No module-level singletons; never put request-scoped state into the container (singletons are reused across serverless requests).
- Cache invalidation per action: `revalidatePath()` server-side + React Query `invalidateQueries` client-side. Forgetting either creates stale data.
- Create a use-case when the op fires side effects, touches >1 service, or enforces rules. Skip for list/get/delete.
- Infra services are the only code that touches Supabase. No direct Supabase calls outside `src/infrastructure/`. Services call `await getDatabaseClient()` from `@/src/infrastructure/supabase/get-database-client` — the helper returns a cookie-bound `createServerClient` server-side (RLS-respecting, JWT from request cookies) or the browser singleton client-side. Server actions call `ensureDatabaseFactoryRegistered()` from `@/app/server/database/register-factory` as their first line. Architectural exceptions: `app/server/auth/require-authenticated-user.ts` and `app/server/database/register-factory.ts` (both allowlisted in `tests/architecture/no-direct-supabase.test.ts`).
- Notifications: `notifications` table (in-app feed) and `notification_queue` (email/SMS) are separate. Always go through `notificationService.sendX()` — it writes both. Type CHECK limits `notifications.type` to `low_stock | roll_depleted | cut_completed | system_alert`; everything else persists as `system_alert`.
