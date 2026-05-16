# Rema Portal — Coding Standards

## Stack

| Layer     | Technology                             |
| --------- | -------------------------------------- |
| Framework | Next.js 16 (App Router)                |
| Language  | TypeScript 5.9 (strict mode)           |
| UI        | TailwindCSS 4 + Radix UI primitives    |
| State     | Zustand 5                              |
| Forms     | React Hook Form + Zod validation       |
| Database  | Supabase (PostgreSQL + Auth + Storage) |
| Charts    | Recharts                               |
| PDF       | jsPDF                                  |
| Email     | React Email + Resend                   |

---

## TypeScript Standards

### Strict mode — no exceptions

```typescript
// tsconfig: strict: true, noUncheckedIndexedAccess: true
```

- **Zero `any`**. Use `unknown` + type narrowing or define a proper interface.
- **No implicit `any`** in function parameters — always annotate.
- **No `as` type assertions** unless narrowing from `unknown` at a system boundary (API response, parsed JSON, Supabase query result). Internal code must flow through the type system without casts.
- **Return types**: let TypeScript infer them. Only annotate when the inferred type is too wide or the function is exported from a library module.

### Type definitions

```typescript
// Co-located: types live next to the code that uses them
// app/dashboard/cutting-engine/_components/nesting-visualizer-types.ts

// Global shared types only in src/types/
// Supabase row types live hand-curated in src/infrastructure/models/supabase.ts
// — keep them in sync with the migration that changes the table shape
```

- Prefer `interface` for object shapes (extendable). Use `type` for unions, intersections, and mapped types.
- Name interfaces descriptively: `CutPlannerState`, not `IState` or `Props`.
- Export only what's consumed outside the file.

### Null handling

```typescript
// Prefer nullish coalescing over logical OR
const name = user.name ?? "Unknown" // correct
const name = user.name || "Unknown" // wrong — false/0/"" are valid values

// Prefer optional chaining
const city = user.address?.city // correct
const city = user && user.address && user.address.city // wrong

// Narrow before use, don't assert
if (data) {
  process(data) // correct — narrowed
}
process(data!) // wrong — suppresses the compiler
```

### Error handling

```typescript
// When error is USED in the catch body:
try {
  await someOperation()
} catch (error) {
  set({ error: (error as Error).message })
  toast.error("Operation failed")
}

// When error is NOT used (intentional swallow):
try {
  await someOperation()
} catch (_error) {
  // fallback behavior — error intentionally ignored
  return defaultValue
}

// NEVER:
try { ... } catch { ... }        // bare catch — loses error context
try { ... } catch (e) { ... }    // single-letter names — not descriptive
```

### Generics

```typescript
// Constrain generics — don't leave them open
function getProperty<T extends Record<string, unknown>>(obj: T, key: keyof T) {
  return obj[key]
}

// Name generics descriptively for complex cases
type StateCreator<TState, TActions> = (
  set: (partial: Partial<TState>) => void,
  get: () => TState & TActions
) => TState & TActions
```

### Enums vs. unions

```typescript
// Use string literal unions, not enums
type RollStatus = "available" | "in_use" | "depleted" // correct
enum RollStatus {
  Available,
  InUse,
  Depleted,
} // wrong

// Exception: numeric enums for bit flags are acceptable
```

---

## React & Component Patterns

### Function components only

```typescript
// Default export, function declaration, destructured props
export default function CutPlannerPage() {
  return <div>...</div>
}

// Named export for non-page components
export function RollCard({ roll }: { roll: Roll }) {
  return <Card>...</Card>
}
```

No arrow-function components at the module level. No class components.

### Props

```typescript
// Simple: inline type annotation
function Badge({ label, color }: { label: string; color: string }) { ... }

// Complex: named interface, same file, above the component
interface NestingVisualizerProps {
  rolls: Roll[]
  onOptimize: (result: NestingResult) => void
  mode?: "simple" | "detail"
}

export function NestingVisualizer({ rolls, onOptimize, mode = "simple" }: NestingVisualizerProps) { ... }
```

- Always destructure in the function signature — never access `props.x`.
- Default values in the destructure, not `defaultProps`.
- Children: use `{ children }: { children: React.ReactNode }`.

### Conditional rendering

```typescript
// Ternary for simple cases
{isLoading ? <Spinner /> : <Content />}

// Early return for guard clauses
if (!data) return <EmptyState />

// Logical AND — but ONLY with booleans
{isVisible && <Modal />}        // correct
{items.length && <List />}      // WRONG — renders 0. Use: items.length > 0 &&
```

### State management hierarchy

| Scope                | Tool          | Example                      |
| -------------------- | ------------- | ---------------------------- |
| Component-local UI   | `useState`    | form inputs, toggles, modals |
| Derived/computed     | `useMemo`     | filtered lists, calculations |
| Shared across routes | Zustand store | inventory, PO state, cuts    |
| Auth only            | React Context | current user, session        |

Never mix — don't put UI state (modal open/close) in Zustand. Don't put shared data in useState.

### Hooks rules

```typescript
// Custom hooks: one concern, use- prefix, kebab-case file
// use-nesting-compute.ts
export function useNestingCompute(rolls: Roll[]) {
  // ...
}
```

- Avoid effect-driven state updates unless the effect is syncing with external state or browser APIs. if you truly need to defer work from an effect, prefer documented patterns like `setTimeout` or `useLayoutEffect` instead of `queueMicrotask()`.

- Every dependency in the deps array must be stable or memoized.
- Extract complex effect logic into named functions outside the component.

### Event handlers

```typescript
// Prefix with "handle" in components
function handleSubmit() { ... }
function handleRollSelect(rollId: string) { ... }

// Prefix with "on" in props
interface Props {
  onSubmit: () => void
  onRollSelect: (rollId: string) => void
}
```

---

## Zustand Store Pattern

```typescript
import { create } from "zustand"

interface InventoryState {
  // Data
  rolls: Roll[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchRolls: () => Promise<void>
  addRoll: (roll: CreateRoll) => Promise<void>
  deleteRoll: (id: string) => Promise<void>
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  rolls: [],
  isLoading: false,
  error: null,

  fetchRolls: async () => {
    set({ isLoading: true, error: null })
    try {
      const rolls = await rollService.getAll()
      set({ rolls, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  addRoll: async (roll) => {
    try {
      await rollService.create(roll)
      await get().fetchRolls() // re-fetch after mutation
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  deleteRoll: async (id) => {
    try {
      await rollService.delete(id)
      set({ rolls: get().rolls.filter((r) => r.id !== id) })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },
}))
```

### Store rules

- State interface includes BOTH data and actions in one flat object.
- Always include `isLoading` + `error` fields.
- Clear `error` at the start of every async action.
- Stores call services — **never** Supabase directly.
- Use `get()` to access current state inside actions.
- For large stores, split helper functions into a separate file (e.g., `po-action-handlers.ts`) — NOT into separate stores.
- Selector usage in components: `const rolls = useInventoryStore(s => s.rolls)` — always use selectors, never destructure the whole store.

---

## Service Layer Pattern

Services live under `src/infrastructure/services/`, implement an interface
from `src/application/services/`, and are TSyringe-registered as
singletons. They are the only code allowed to call Supabase, and they
must resolve the client via the runtime-aware helper rather than
importing the browser singleton directly.

```typescript
import { inject, injectable } from "tsyringe"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import { Roll } from "@/src/entities/roll"
import { TOKENS } from "@/di/tokens"
import type { IRollsRepository } from "@/src/application/repositories/rolls.repository.interface"

@injectable()
export class RollService implements IRollService {
  constructor(
    @inject(TOKENS.IRollsRepository) private readonly rolls: IRollsRepository,
  ) {}

  async getAll(): Promise<Roll[]> {
    const supabase = await getDatabaseClient()
    const { data, error } = await supabase
      .from("rolls")
      .select("*")
      .order("created_at", { ascending: false })
    if (error) throw error
    return data.map(Roll.fromPersistence)
  }
}
```

### Service rules

- Services are the **only** code that talks to Supabase.
- Services throw on error — callers (stores/components) catch.
- Return entities (or DTOs) — never raw `{ data, error }` response objects.
- One service per aggregate root. Cross-aggregate orchestration belongs in a use-case, not a service method.
- TSyringe-registered with `@injectable()` + `@inject(TOKEN)`. No module-level singleton exports; no `new FooService()` outside DI.
- Stateless — never put request-scoped data on the instance (singletons are reused across serverless requests on the same worker).
- Repositories handle raw row CRUD; services compose repository calls + domain logic.

---

## Styling (TailwindCSS)

```typescript
// Correct — Tailwind utilities in className
<div className="flex items-center gap-4 rounded-lg bg-white p-6 shadow-sm dark:bg-zinc-900">

// Wrong — inline styles
<div style={{ display: "flex", padding: 24 }}>

// Wrong — CSS modules
import styles from "./Component.module.css"
```

- Mobile-first responsive: `sm:`, `md:`, `lg:` prefixes.
- Dark mode: `dark:` prefix variants.
- No `style={}` unless the value is truly dynamic (e.g., computed width/position from JS).
- No CSS modules, styled-components, or separate CSS files.
- Use `cn()` utility (from `@/lib/utils`) for conditional class merging:

```typescript
import { cn } from "@/lib/utils"

<div className={cn(
  "rounded-lg p-4",
  isActive && "border-2 border-blue-500",
  isDisabled && "opacity-50 pointer-events-none"
)} />
```

---

## Async Patterns

### Data fetching in components

```typescript
// Fetch on mount via store action
useEffect(() => {
  fetchRolls()
}, [fetchRolls])

// Show loading/error states
if (isLoading) return <Skeleton />
if (error) return <ErrorBanner message={error} />
return <RollList rolls={rolls} />
```

### Parallel operations

```typescript
// Use Promise.all for independent operations
const [rolls, materials] = await Promise.all([rollService.getAll(), materialService.getAll()])

// Use Promise.allSettled when partial failure is acceptable
const results = await Promise.allSettled(ids.map((id) => rollService.delete(id)))
```

### Cancellation

```typescript
// AbortController for cancellable fetches (e.g., search-as-you-type)
useEffect(() => {
  const controller = new AbortController()
  fetch("/api/something", { signal: controller.signal })
  return () => controller.abort()
}, [deps])
```

Note: the AutoNest pack pipeline is no longer cancellable from the
browser — `Pack` is a single request/response round-trip to the Rust
engine. The previous streaming + AbortSignal protocol was retired with
the canonical Rust pipeline.

---

## File Size & Complexity Limits

| Rule                     | Limit            | Action when exceeded                  |
| ------------------------ | ---------------- | ------------------------------------- |
| `max-lines`              | 500 per file     | Extract sub-components or helpers     |
| `max-lines-per-function` | 200 per function | Break into smaller functions          |
| `complexity`             | 20 cyclomatic    | Simplify branching or extract helpers |

### Extraction strategies

1. **Large component** → extract sub-components into sibling files in `_components/`
2. **Complex computation** → extract into a pure function in a `-utils.ts` or `-layout.ts` file
3. **Complex hooks** → split into focused `use-*.ts` files
4. **eslint-disable** → only for inherently complex pure functions (scoring algorithms, layout computation). Never for components.

---

## Naming Conventions

| Thing                  | Convention                 | Example                                   |
| ---------------------- | -------------------------- | ----------------------------------------- |
| Components             | PascalCase                 | `NestingVisualizer`, `RollCard`           |
| Hooks                  | camelCase, `use` prefix    | `useNestingCompute`, `usePresetState`     |
| Functions              | camelCase                  | `computeWaste`, `handleSubmit`            |
| Constants              | SCREAMING_SNAKE            | `MAX_ROLLS_PER_PAGE`, `DEFAULT_WIDTH`     |
| Types/Interfaces       | PascalCase                 | `CutPlannerState`, `NestingResult`        |
| Files: components      | kebab-case.tsx (preferred) | `quick-create-form.tsx`, `roll-card.tsx`  |
| Files: everything else | kebab-case.ts              | `use-nesting-compute.ts`, `roll-utils.ts` |
| Booleans               | `is`/`has`/`should` prefix | `isLoading`, `hasError`, `shouldOptimize` |
| Arrays                 | plural nouns               | `rolls`, `materials`, `cutResults`        |
| Handlers (component)   | `handle` prefix            | `handleDelete`, `handleRollSelect`        |
| Handlers (props)       | `on` prefix                | `onDelete`, `onRollSelect`                |

---

## Import Rules

### Order (enforced by ESLint)

```typescript
// 1. React / Next.js
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

// 2. Third-party
import { toast } from "sonner"
import { z } from "zod"

// 3. Internal aliases (@/)
import { Button } from "@/app/components/ui/button"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { useInventoryStore } from "@/app/stores/inventoryStore"

// 4. Relative (sibling files)
import { computeLayout } from "./nesting-viz-simple-layout"
import type { NestingVisualizerProps } from "./nesting-visualizer-types"
```

### Import rules

- Use `@/` path alias for all non-relative imports.
- Type-only imports: `import type { ... }` when importing only types.
- No barrel files (`index.ts` re-exports) — import directly from source.
- No default imports from libraries (use named: `import { create } from "zustand"`, not `import create`).

---

## Git & Commits

- Commits are manual — never auto-commit.
- No `Co-Authored-By` lines.
- Message format: imperative mood, lowercase, no period. `fix waste calculation for multi-part layouts`
- One logical change per commit.

---

## Anti-Patterns (Do Not Do)

```typescript
// Don't use any
const data: any = await fetch(...)       // use unknown + narrow

// Don't use non-null assertion
const name = user!.name                  // narrow with if-check instead

// Don't put UI state in stores
const useStore = create(set => ({
  isModalOpen: false,                    // this belongs in useState
}))

// Don't access store without selector
const { rolls, isLoading } = useInventoryStore()        // re-renders on ANY change
const rolls = useInventoryStore(s => s.rolls)            // re-renders only when rolls change

// Don't call Supabase outside services
const { data } = await supabase.from("rolls").select()   // move to rollService

// Don't use useEffect for derived state
useEffect(() => {
  setFilteredRolls(rolls.filter(r => r.status === filter))
}, [rolls, filter])
// Instead: const filteredRolls = useMemo(() => rolls.filter(...), [rolls, filter])

// Don't catch and ignore errors silently
try { ... } catch { }                   // always log or handle

// Don't use index as key for dynamic lists
{rolls.map((roll, i) => <RollCard key={i} />)}   // use roll.id
```

---

## Verification Checklist

Before any change is considered done:

```bash
npm run typecheck         # 0 errors
npm run lint              # 0 errors, 0 warnings
npm run format:check      # all web files formatted
npm run fmt:rust -- --check
npm run clippy:rust       # 0 warnings
```

GitHub Actions enforces this through one `Code Quality` workflow with two jobs:
- `web quality` → Prettier + ESLint + TypeScript
- `rust quality` → `rustfmt --check` + `clippy -D warnings`

All required checks must pass. No exceptions.
