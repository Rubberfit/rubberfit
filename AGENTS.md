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
    - supabase/ — generated types + SQL migrations
  - interface-adapters/
    - Reserved for controllers. Currently empty — no server actions exist yet, so client hooks fill the controller role.

- app/
  - Frameworks & Drivers Layer — Next.js pages, hooks, components, styles

- .claude/
  - handoff/ — task briefs and second-opinion assignments
  - research/ — investigation notes and reports

- proxy.ts — Next.js request proxy for dashboard auth and permission gating
- nesting/ — 2D nesting engine
- di/ — TSyringe DI registration

## Data Flow

- Simple (pure CRUD): `app/ hook → infrastructure service → Supabase`
- Complex (rules/side effects): `app/ hook → src/application/use-cases/ → service(s) → Supabase`
- Hooks own UI concerns (toast, router, loading). Use-cases own business logic (tax calc, cross-service coordination, notifications).
- Use-cases are TSyringe-registered. Classes use `@injectable()` + `@inject(TOKEN)`; call sites resolve via `resolveUseCase<IFoo>(TOKENS.IFoo)` from `@/di/resolve`. No module-level singletons — class files are import-safe for unit tests.
- Create a use-case when the op fires side effects, touches >1 service, or enforces rules. Skip for list/get/delete.
- Infra services are the only code that touches Supabase. No direct Supabase calls outside `src/infrastructure/`.
- Notifications: `notifications` table (in-app feed) and `notification_queue` (email/SMS) are separate. Always go through `notificationService.sendX()` — it writes both. Type CHECK limits `notifications.type` to `low_stock | roll_depleted | cut_completed | system_alert`; everything else persists as `system_alert`.
