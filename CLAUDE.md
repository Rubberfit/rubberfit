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
├── application/            # Use cases and repository interfaces
├── entities/               # Domain models and custom errors
├── infrastructure/         # Supabase implementations (services, repositories)
└── interface-adapters/     # Controllers — entry points into the domain

app/                        # Frameworks & Drivers (Next.js)
nesting/                    # 2D NFP nesting engine (standalone)
di/                         # TSyringe dependency injection registration
config/                     # App-wide constants (APP_CONFIG)
```

**Layer rules:**

- `app/` (Next.js pages, server actions, components) calls interface-adapters controllers or calls infrastructure services directly
- Infrastructure services are **the only** code that talks to Supabase — no direct Supabase calls outside `src/infrastructure/`
- Zustand stores call services; they never call Supabase directly
- Next.js files must stay in `app/`; domain logic belongs in `src/`

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
