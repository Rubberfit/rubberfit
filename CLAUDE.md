# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Next.js dev server
npm run build            # Production build
npm run start            # Production server

# Code quality (run both before committing)
npm run typecheck        # tsc --noEmit — must be zero errors
npm run lint             # ESLint — must be zero errors, zero warnings
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format
npm run format:check     # Check formatting without writing
```

There are no automated tests in this project. Verification is done via `typecheck` and `lint`.

## Architecture

This project uses **Clean Architecture**. The layer boundary is strictly enforced — never skip layers.

```
src/                        # Domain logic (framework-agnostic)
├── application/
│   ├── services/           # Service interfaces (IPurchaseOrderService, etc.)
│   ├── repositories/       # Repository interfaces
│   └── use-cases/          # Business-logic orchestrators (complex ops only)
├── entities/               # Domain models and custom errors
├── infrastructure/
│   ├── services/           # Supabase-backed service implementations
│   ├── repositories/       # Supabase-backed repository implementations
│   └── supabase/           # Generated types + SQL migrations
└── interface-adapters/     # Reserved for controllers — currently empty, no server actions yet

app/                        # Frameworks & Drivers (Next.js)
nesting/                    # 2D NFP nesting engine (standalone)
di/                         # TSyringe dependency injection registration
config/                     # App-wide constants (APP_CONFIG)
```

**Layer rules:**

- Infrastructure services are **the only** code that talks to Supabase — no direct Supabase calls outside `src/infrastructure/`
- Zustand stores call services (or use-cases); they never call Supabase directly
- Next.js files must stay in `app/`; domain logic belongs in `src/`
- Use-cases call services/repositories; services never call use-cases (one-way flow)

### Data Flow

Two valid flows, chosen based on the operation's complexity:

**Simple (pure CRUD):**
```
app/ hook or component  →  infrastructure service  →  Supabase
```
Used for list/get/delete and single-field updates. Example: `app/dashboard/inventory/suppliers/` calls `supplierService.getAllSuppliers()` directly.

**Complex (business rules or multi-service):**
```
app/ hook  →  src/application/use-cases/  →  infrastructure service(s)  →  Supabase
```
The hook still owns UI concerns (toast, `router.push`, loading state). The use-case owns business logic (tax calculation, cross-service coordination, notification side effects). Example: `po-action-handlers.ts::createPO` resolves `ICreatePurchaseOrderUseCase` from the container and invokes `.execute(...)` → `purchaseOrderService` + `taxService`.

**Use-case wiring:**
- Each use-case is a class marked `@injectable()` with `@inject(TOKEN)` constructor params; it also exports an `I*UseCase` interface (see `src/application/use-cases/purchase-orders/create-purchase-order.use-case.ts`).
- Registered via `container.registerSingleton(TOKENS.IFooUseCase, FooUseCase)` in `di/di-registration.ts`.
- Resolved at call sites via `resolveUseCase<IFooUseCase>(TOKENS.IFooUseCase)` from `@/di/resolve`. **Never** import or re-create a use-case singleton; always go through the container.
- No module-level singleton exports — use-case class files are import-safe in isolation. Unit tests register fakes with `container.registerInstance(TOKENS.IDependency, fake)` before resolving the use-case, without pulling Supabase at import time.

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

`src/interface-adapters/` is reserved for controllers but currently empty. Controllers only earn their cost once server actions or API routes exist — at that point the action/route handler delegates to a controller that parses input, calls a use-case, and shapes the response. Until then, client hooks fill the controller role (form validation + use-case invocation + UI side effects).

### Notifications gotcha

There are **two separate tables**, read from different code paths:

| Table | Purpose | Written by | Read by |
|---|---|---|---|
| `notifications` | In-app UI feed (notifications page) | `notificationService.persistInAppNotification()` + low-stock DB triggers | `notificationCrudService` / `notificationRepository` |
| `notification_queue` | Async email/SMS dispatch | `notificationService.queueNotification()` | `emailService.processEmailQueue()` |

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

- **Cut Planner** (`app/dashboard/cut-planner/`): Greedy First-Fit-Decreasing algorithm + 2D NFP nesting engine in `nesting/` using a genetic algorithm to minimize material waste
- **RBAC**: Roles are `admin`, `cutter`, `manager`, `member`, `supervisor`, `viewer`. Permission definitions live in `src/application/permissions.ts`; route protection via `canAccessPath()` in `app/lib/rbac.ts`
- **Database**: Supabase PostgreSQL with RLS on all tables. Migrations live in `supabase/migrations/`. Triggers auto-deplete rolls at zero length and fire low-stock notifications

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```
