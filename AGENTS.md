# AGENTS.md

Onboarding doc for AI agents (Claude Code, Codex, Kimi, etc.) working in this repo. **Read this before writing code.** Architectural detail lives in [`CLAUDE.md`](./CLAUDE.md); this file is the entry point — what to reuse, where to look, and the definition of done.

# Expectations

- In all interactions and commit messages, be extremely concise.
- When prompted for large tasks, always formulate a multi-part plan to be executed in phases.
- Provide the pros and cons for design implementations.
- Once prompted to execute plan, provide code changes.
- When creating new files, return here and update the "Project Structure".

# Rules

- Next JS related files must go in the app directory.
- Take into consideration of the boundary lines of the clean architecture when making changes to files.

# Reusable surface — check before you write

The most common failure mode is reinventing a utility that already exists. Scan this table first:

| You need…                            | Use this — don't reinvent                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| A monetary value                     | `Money` + `Currency` VOs in [`src/entities/value-objects/`](./src/entities/value-objects/)                                     |
| An entity identifier                 | `Id<Brand>` in [`src/entities/value-objects/id.ts`](./src/entities/value-objects/id.ts) — 20 branded ID types already declared |
| String length / trim validation      | `trimRequired` / `trimOptional` in [`src/entities/shared/string-helpers.ts`](./src/entities/shared/string-helpers.ts)          |
| Null-safe VO equality                | `nullableEqual` in [`src/entities/shared/equality.ts`](./src/entities/shared/equality.ts)                                      |
| A status enum with transition guards | Pattern in [`po-status.ts`](./src/entities/value-objects/po-status.ts) — copy the shape, don't hardcode strings                |
| An RBAC permission check             | `PERMISSIONS` + `ROUTE_PERMISSIONS` in [`src/application/permissions.ts`](./src/application/permissions.ts)                    |
| A domain error                       | `InvalidEntityError` / `InvalidValueObjectError` in [`src/entities/errors/`](./src/entities/errors/)                           |
| A packing pipeline part / request    | Factories in [`src/application/packing/`](./src/application/packing/) — see its README                                         |
| To resolve a service or use-case     | `resolveUseCase<I…>(TOKENS.I…)` from [`di/resolve.ts`](./di/resolve.ts); tokens in [`di/tokens.ts`](./di/tokens.ts)            |

# Index files

Per-domain catalogs — each one lists what exists, with file paths and one-liners. Read the relevant one before adding code in that folder:

- [`src/entities/README.md`](./src/entities/README.md) — entities and aggregate roots
- [`src/entities/value-objects/README.md`](./src/entities/value-objects/README.md) — value objects + ID brands
- [`src/application/services/README.md`](./src/application/services/README.md) — service interfaces
- [`src/application/use-cases/README.md`](./src/application/use-cases/README.md) — use-cases
- [`app/actions/README.md`](./app/actions/README.md) — server actions
- [`di/README.md`](./di/README.md) — DI token registry
- [`src/application/packing/README.md`](./src/application/packing/README.md) — packing pipeline boundary types

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

## 5-step recipe: add a new entity end-to-end

For a new domain concept that needs CRUD + business rules. Update the matching index README at each step.

1. **Entity** in [`src/entities/<name>.ts`](./src/entities/) — three-tier props (`Create*Props` / `Reconstitute*Props` / `*Snapshot`), private `#` fields, static `create()` / `fromPersistence()` factories, child VOs as needed. Reuse `Id<Brand>`, `Money`, `trimRequired`, `nullableEqual`. Update [`src/entities/README.md`](./src/entities/README.md). If you add a new ID brand, also update [`src/entities/value-objects/README.md`](./src/entities/value-objects/README.md).
2. **Service interface** in `src/application/services/<name>.service.interface.ts`. Update [`src/application/services/README.md`](./src/application/services/README.md).
3. **Infrastructure service** in `src/infrastructure/services/<name>Service.ts` — Supabase via `await getDatabaseClient()`, not the browser singleton.
4. **DI token + registration** — add a `Symbol("INameService")` to [`di/tokens.ts`](./di/tokens.ts), register in [`di/di-registration.ts`](./di/di-registration.ts). Update [`di/README.md`](./di/README.md).
5. **(Orchestrated ops only)** Use-case in `src/application/use-cases/<domain>/<name>.use-case.ts` + server action wrapper in `app/actions/<domain>.ts`. Update both [`use-cases`](./src/application/use-cases/README.md) and [`actions`](./app/actions/README.md) READMEs.

A server action without an underlying use-case should be rare — re-read "When to create a use-case" first.

## Definition of done

Before declaring a task complete, if your changes added or renamed any of the following, **update the matching index README in the same commit**:

| Added or renamed…                                                      | Update this index                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A file under `src/entities/` (not `value-objects/`, not `shared/`)     | [`src/entities/README.md`](./src/entities/README.md)                             |
| A VO under `src/entities/value-objects/` or a new `Id` brand           | [`src/entities/value-objects/README.md`](./src/entities/value-objects/README.md) |
| A `*.interface.ts` under `src/application/services/`                   | [`src/application/services/README.md`](./src/application/services/README.md)     |
| A `*.use-case.ts` under `src/application/use-cases/`                   | [`src/application/use-cases/README.md`](./src/application/use-cases/README.md)   |
| A file under `app/actions/`                                            | [`app/actions/README.md`](./app/actions/README.md)                               |
| A DI token in `di/tokens.ts` or a registration in `di-registration.ts` | [`di/README.md`](./di/README.md)                                                 |

These indexes are the agent onboarding surface — if they rot, the next agent re-derives the catalog from scratch and likely reinvents something. The PR template carries a checkbox for this; CI does not block on it, so human + agent discipline is the gate. If a Stop hook is installed at `.claude/hooks/check-index-drift.sh`, it prints a non-blocking warning when domain files changed without a matching README touch — heed it.
