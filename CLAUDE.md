# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Next.js dev server
npm run build            # Production build (prebuild hook rebuilds the Rust engine)
npm run start            # Production server

# Code quality (run before committing)
npm run typecheck        # tsc --noEmit — must be zero errors
npm run lint             # ESLint — must be zero errors, zero warnings
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format
npm run format:check     # Check formatting without writing

# Tests (pretest hook auto-rebuilds the Rust engine)
npm run test             # Vitest — runs TS unit + integration tests
npm run test:parity      # Parity snapshots (legacy + rust baselines)
npm run test:rust        # cargo test for the Rust workspace

# Rust engine (standalone)
npm run build:engine     # cargo build --release — produces engine/target/release/pack-cli
npm run fmt:rust         # cargo fmt --all
npm run clippy:rust      # cargo clippy (-D warnings)
```

Tests live in `tests/` (Vitest) and `engine/crates/*/tests/` (cargo). The GitHub `Code Quality` workflow is one workflow with two jobs: `web quality` (Prettier + ESLint + TypeScript) and `rust quality` (`rustfmt --check` + `clippy -D warnings`).

Pre-commit verification runs `typecheck` + `lint` + `format:check` + `fmt:rust` + `clippy:rust` + `test`.

## Architecture

This project uses **Clean Architecture**. The layer boundary is strictly enforced — never skip layers.

```
src/                        # Domain logic (framework-agnostic)
├── application/
│   ├── services/           # Service interfaces (IPurchaseOrderService, etc.)
│   ├── repositories/       # Repository interfaces
│   ├── packing/            # Canonical packing types + IPackingService pipeline
│   └── use-cases/          # Business-logic orchestrators (complex ops only)
├── entities/               # Domain models and custom errors
├── infrastructure/
│   ├── services/           # Supabase-backed service implementations (+ RustPackingService)
│   ├── repositories/       # Supabase-backed repository implementations
│   └── supabase/           # Generated types + SQL migrations
└── interface-adapters/     # Reserved for controllers — currently empty, no server actions yet

app/                        # Frameworks & Drivers (Next.js)
engine/                     # Rust nesting engine (Cargo workspace)
├── crates/rf-geom/       # Geometry primitives (MIT, future open-source crate)
├── crates/rf-layout/     # Packing engine (MIT, future open-source crate; depends on jagua-rs)
└── crates/pack-cli/        # stdin/stdout JSON delivery binary (private)
nesting/                    # Legacy TS 2D NFP utilities — no longer a packing fallback, but still used by cutting-engine UI for NFP-based shape previews (removal tracked as Task #16, post-Tauri cleanup)
di/                         # TSyringe dependency injection registration
config/                     # App-wide constants (APP_CONFIG)
tests/                      # Vitest TS tests (packing, parity, service boundaries)
```

### Packing engine

`IPackingService` is the canonical packing interface
(`src/application/services/packing.service.interface.ts`). DI binds it
based on environment:

| Context               | Implementation       | Invocation                                                                                 |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| Server (Node runtime) | `RustPackingService` | `child_process.spawn("pack-cli")` with JSON stdin/stdout                                   |
| Browser               | `ApiPackingService`  | `fetch("/api/v2/pack", ...)` — the route handler resolves `RustPackingService` server-side |

Single source of truth: every AutoNest pack — preview-grade or
production — flows through `pack-cli`. There is no TS fallback.

AutoNest runs Rust on every Pack click. There is no TS-side
heuristic packer or live preview generator — operators select all
parts, dial in stock, then press **Pack**. Multi-sheet allocation
uses an auto-fill estimator (`SAFETY_FACTOR ≈ 1.54×` over total
part area) capped at `MAX_SHEETS = 50`, with auto-boost on overflow
that silently re-packs against more bins until everything fits or
the cap is reached.

The Rust path is the full S2.5 stack: FFD bin-assignment + 2D grid
warm-start + sparrow-style Guided Local Search + cross-bin swap
orchestrator. Benchmarks:
`docs/superpowers/benchmarks/2026-04-18-s2.5-results.md`.

The previous streaming protocol (`pack-cli --stream` NDJSON +
`AbortSignal` cancellation) was removed alongside the browser-side
short-circuit. Browser → `/api/v2/pack` → `pack-cli` is a single
request/response cycle.

### Pack-button UX (no live load)

`/dashboard/cutting-engine` does NOT pack on every keystroke. The
page owns a [`usePackGate`](app/dashboard/cutting-engine/_hooks/use-pack-gate.ts)
state machine — `idle` → `packing` → `done` — and feeds the Rust
pipeline via [`usePackJob`](app/dashboard/cutting-engine/_components/use-pack-job.ts):

- **`idle`** (default + after any input change): the Graph card shows
  an empty sheet card with a **Pack** button. `usePackJob` is
  disabled, so no `/api/v2/pack` request fires.
- **`packing`** (after the operator presses Pack): minimum 450 ms
  display window so the loader is perceivable; the hook resolves
  `IPackingService` and sends a single `PackRequest`.
- **`done`**: the hook returns `LayoutModel[]`; the visualizer
  (`NestingVisualizer`) renders them via the existing simple-mode
  renderer. Any subsequent input change resets the gate to `idle`
  and clears `autoBoost`.

Frozen layouts loaded from `cut_history.layout_json.auto.layouts`
bypass the gate entirely — a saved cut always renders.

The visualizer is now a thin `LayoutModel[]` consumer — there is no
TS-side preview generator, no `useNfpOptimizer`, no
`buildMultiSheet`, no async worker pool. Pre-Pack: empty sheet card.
Post-Pack: rendered layouts straight from the Rust round-trip.

### Dev server

`npm run dev` does NOT auto-build the Rust engine (unlike
`npm run build`, which has a `prebuild` hook). On a fresh clone:

```bash
npm install
npm run build:engine    # one-time; ~2 min cold, seconds after
npm run dev
```

Without the binary, the first POST to `/api/v2/pack` (triggered by
pressing **Pack** on `/dashboard/cutting-engine`) returns a 500
with "pack-cli binary not found"; the DI container fails fast on
the server's first `IPackingService` resolve.

**Layer rules:**

- Infrastructure services are **the only** code that talks to Supabase — no direct Supabase calls outside `src/infrastructure/`
- Zustand stores call services (or use-cases); they never call Supabase directly
- Next.js files must stay in `app/`; domain logic belongs in `src/`
- Use-cases call services/repositories; services never call use-cases (one-way flow)

### Data Flow

Two valid flows, chosen by the operation's complexity:

**Simple (pure CRUD):**

```text
app/ hook or component  →  infrastructure service  →  Supabase
```

Used for list/get/delete and single-field updates. Example: `app/dashboard/inventory/suppliers/` calls `supplierService.getAllSuppliers()` directly.

**Orchestrated (multi-service writes, side effects, auth-bound work):**

```text
app/ hook  →  app/actions/<domain>.ts (server action)  →  src/application/use-cases/  →  infrastructure service(s)  →  Supabase
```

Server actions enforce the orchestration boundary as a hard physical line — the use-case body runs server-side, never in the browser bundle. Each action's first lines are `requireAuthenticatedUser()` (resolves the caller via cookies, throws on unauthenticated/deactivated/missing-profile) and `requirePermission(actor, ...)` (RBAC check). The use-case takes `actor: ActionActor` in its input so audit logging and side effects have the caller's identity without reaching for a global. Cache invalidation is per-action: `revalidatePath()` for RSC routes plus React Query `invalidateQueries` from the client. Example: `app/actions/purchase-orders.ts::createPurchaseOrder` wraps `ICreatePurchaseOrderUseCase`; [`po-action-handlers.ts::createPO`](app/dashboard/inventory/purchase-orders/_components/po-action-handlers.ts) imports the action and `await`s it.

**Use-case wiring:**

- Each use-case is a class marked `@injectable()` with `@inject(TOKEN)` constructor params; it also exports an `I*UseCase` interface (see `src/application/use-cases/purchase-orders/create-purchase-order.use-case.ts`).
- Registered via `container.registerSingleton(TOKENS.IFooUseCase, FooUseCase)` in `di/di-registration.ts`.
- Resolved server-side at the action layer via `resolveUseCase<IFooUseCase>(TOKENS.IFooUseCase)` from `@/di/resolve`. **Never** import or re-create a use-case singleton; always go through the container. **Never** put request-scoped state into TSyringe singletons — they're shared across serverless requests on the same worker.
- No module-level singleton exports — use-case class files are import-safe in isolation. Unit tests register fakes with `container.registerInstance(TOKENS.IDependency, fake)` before resolving the use-case, without pulling Supabase at import time.

**Action wiring:**

- Each domain has one file under `app/actions/<domain>.ts` with `"use server"` at the top.
- Public action input is `Omit<UseCaseInput, "actor">` — clients can't spoof identity. The action injects `actor` from `requireAuthenticatedUser()` before invoking the use-case.
- Errors propagate via three typed classes: `UnauthorizedError` (401-class), `ForbiddenError` (403-class), `AuthConfigError` (5xx-class). Catch wrappers discriminate on `code`, not `instanceof` (errors lose prototype chain across the RPC boundary).
- `app/server/auth/require-authenticated-user.ts` is in [`tests/architecture/no-direct-supabase.test.ts`](tests/architecture/no-direct-supabase.test.ts)'s allowlist — its cookie-bound `createServerClient` is the unavoidable framework boundary, like `proxy.ts`.

**Database client resolution:**

- Infrastructure services do **not** import the browser-singleton `supabase` from `@/src/infrastructure/models/supabase` directly. Instead, they call `await getDatabaseClient()` from [`@/src/infrastructure/supabase/get-database-client`](src/infrastructure/supabase/get-database-client.ts). The helper returns the right client for the runtime: a cookie-bound `createServerClient` on the server (RLS-respecting — Postgres sees `auth.uid()` from the request JWT) or the browser singleton in the client bundle.
- Server actions and route handlers must call `ensureDatabaseFactoryRegistered()` from [`@/app/server/database/register-factory`](app/server/database/register-factory.ts) as the first line of every entry point that may touch the database. The call is idempotent. Codex review flagged layout-based registration as risky in serverless runtimes (Next.js does not contractually guarantee layout module evaluation before a server-action POST), so registration happens at action entry instead.
- **Never** use the service-role key for normal CRUD. RLS is the security model; the anon-key + cookie pattern preserves it. Service-role escapes (`makeAdminClient` in `src/infrastructure/supabase/server-clients.ts`) are reserved for explicitly-authorized admin route handlers.

### When to create a use-case

Create one if the operation does **any** of:

- Fires a side effect (notification, audit log, cache invalidation)
- Touches more than one service (e.g., tax + PO + notification)
- Enforces a business rule (status transition validation, threshold checks, EOQ math)
- Will be reused from multiple entry points

**Don't** create one for:

- Pure read/list/get/delete — call the service directly from the hook
- Single-field updates with no validation or side effect
- Pass-through wrappers that add no logic

See `src/application/use-cases/` for current examples (7 use-cases across `purchase-orders/` and `reorder/`).

### Controllers

`src/interface-adapters/` is reserved for controllers but stays empty. Server actions in `app/actions/<domain>.ts` fill the controller role — they parse input, enforce auth + permission, invoke the use-case, and shape the response. Adding a separate controllers tier on top would be a layer without a job.

### Notifications gotcha

There are **two separate tables**, read from different code paths:

| Table                | Purpose                             | Written by                                                               | Read by                                              |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `notifications`      | In-app UI feed (notifications page) | `notificationService.persistInAppNotification()` + low-stock DB triggers | `notificationCrudService` / `notificationRepository` |
| `notification_queue` | Async email/SMS dispatch            | `notificationService.queueNotification()`                                | `emailService.processEmailQueue()`                   |

The `notifications` table has a CHECK constraint on `type` (`low_stock | roll_depleted | cut_completed | system_alert`); non-low-stock events are persisted as `system_alert`. When adding new notification triggers, always route through `notificationService.sendX()` methods — they handle preferences, quiet hours, toast, DB persist, and queue in one call. Don't write directly to either table from use-cases or hooks.

## State Management

State lives at the lowest scope that works:

| Scope                    | Solution                       |
| ------------------------ | ------------------------------ |
| Component-local UI state | `useState`                     |
| Derived/computed values  | `useMemo`                      |
| Shared across routes     | Zustand store in `app/stores/` |
| Auth only                | React Context                  |

Zustand stores follow a flat interface with `isLoading`, `isUpdating`, and `error` fields. Components use selectors: `useStore(s => s.data)`. Never put UI state (modal open/closed, hover, etc.) in Zustand.

### Hooks colocation (2-tier rule, S4 Task 4)

| Scope                                         | Location                                       |
| --------------------------------------------- | ---------------------------------------------- |
| Page-local (used by one surface only)         | `app/dashboard/<surface>/_components/use-*.ts` |
| App-wide (multiple surfaces or cross-cutting) | `app/hooks/use-*.ts`                           |

No domain tier (`<surface>/_hooks/`) — if a surface grows past
five shared hooks, revisit. Until then, two tiers is enough.

## TypeScript Rules (Strict — No Exceptions)

- **Zero `any`** — use `unknown` + type narrowing or define an interface
- **No non-null assertions (`!`)** — narrow with `if` checks instead
- **No `as` casts** except at system boundaries (API responses, Supabase results, parsed JSON)
- **No implicit `any`** in function parameters — always annotate
- Prefer `interface` for object shapes, `type` for unions/intersections/mapped types
- Supabase types are auto-generated — never edit them manually

```typescript
// Null handling
const name = user.name ?? "Unknown"   // correct — nullish coalesce
const val = a?.b?.c                   // correct — optional chaining

// Error handling
catch (error) {          // use when error IS referenced
  set({ error: (error as Error).message })
}
catch (_error) {         // use when error is intentionally ignored
  return defaultValue
}
// NEVER: catch { } or catch (e) { }
```

## Styling

- **TailwindCSS utilities only** — no CSS modules, no inline styles except for dynamic computed values
- Dark mode via `dark:` prefix; mobile-first responsive via `sm:`, `md:`, `lg:`
- Class merging via `cn()` from `@/lib/utils`

## Component Patterns

- Function declarations with destructured props (not arrow functions at module level)
- Types co-located near the code that uses them; shared global types in `src/types/`
- Conditional rendering: ternary for simple cases, early return for guards, `&&` only with boolean (not numbers)
- Custom hooks: `use-` prefix, kebab-case filenames
- File size limit: 500 lines per file; extract to `_components/` subdirs or `*-utils.ts` files

## Naming Conventions

| Thing                      | Convention                         |
| -------------------------- | ---------------------------------- |
| Components                 | `PascalCase`                       |
| Hooks                      | `useXxx` camelCase                 |
| Functions                  | `camelCase`                        |
| Constants                  | `SCREAMING_SNAKE_CASE`             |
| Files                      | `kebab-case.tsx` / `kebab-case.ts` |
| Booleans                   | `is*`, `has*`, `should*` prefix    |
| Event handlers (component) | `handle*`                          |
| Event handlers (props)     | `on*`                              |

## Key Domain Features

- **Cutting Engine** (`app/dashboard/cutting-engine/`, renamed from Cut Planner in S4 Task 8): 2D nesting via `IPackingService`. Browser → `fetch("/api/v2/pack")` → server `RustPackingService` → `pack-cli` (full S2.5 stack: FFD + 2D grid warm-start + sparrow GLS + cross-bin swap). No streaming, no AbortSignal — single request/response. Live UI previews still run TS-side for responsiveness; the production pack always lands on Rust. Parity test fixture (`tests/packing/parity/`) runs under `npm run test:parity`.
- **RBAC**: Roles are `admin`, `cutter`, `manager`, `member`, `supervisor`, `viewer`. Permission definitions live in `src/application/permissions.ts`; route protection via `canAccessPath()` in `app/lib/rbac.ts`
- **Database**: Supabase PostgreSQL with RLS on all tables. Migrations live in `supabase/migrations/`. Triggers auto-deplete rolls at zero length and fire low-stock notifications

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
