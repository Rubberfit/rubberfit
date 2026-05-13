# Work summary — 2026-05-12

Branch: `feature/DDD-implementation` (built on `refactor/arc-25-multi-tenancy` → `7248a06f`).

## What shipped this session

Single commit landed: **`b6a03a14` — roll service (fifth DDD migration + entity-typed surface)**, pushed to `origin/feature/DDD-implementation`. Status update posted to Linear ARC-25 covering both branches (schema rebuild + the application-layer DDD work on top).

The rollService migration mirrors the four-service template established earlier:

| Layer                    | File                                                                                                                                                                    | Status                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Mapper                   | `src/infrastructure/mappers/roll.mapper.ts`                                                                                                                             | NEW — `RollRow` local persistence type, `rowToRoll`, `rollToInsertRow`, `rollToUpdateRow`; USD default; mm/cents units              |
| Repository interface     | `src/application/repositories/rolls.repository.interface.ts`                                                                                                            | REWRITTEN — entity-typed methods + legacy methods marked `@deprecated`                                                              |
| Repository impl          | `src/infrastructure/repositories/rolls.repository.ts`                                                                                                                   | REWRITTEN — `@injectable()` class; mapper-driven entity surface alongside legacy raw-row surface                                    |
| Service interface        | `src/application/services/roll.service.interface.ts`                                                                                                                    | REWRITTEN — entity-typed thin orchestrator (`consumeLength`, `reserve`, `release`, `relocate`, `recordBarcode`, `softDelete`, etc.) |
| Service impl             | `src/infrastructure/services/rollService.ts`                                                                                                                            | REWRITTEN — `@injectable() class RollService` with `@inject(TOKENS.IRollsRepository)`; load → mutate → `repo.update`                |
| Legacy shim              | `src/infrastructure/services/legacyRollService.ts`                                                                                                                      | NEW — re-exports `rollsRepository` as `legacyRollService` so 10 consumer files keep working                                         |
| DI                       | `di/tokens.ts` + `di/di-registration.ts`                                                                                                                                | MODIFIED — added `IRollsRepository` token, flipped `IRollService` to `registerSingleton`                                            |
| Tests                    | `tests/infrastructure/mappers/roll.mapper.test.ts` (14) + `tests/services/rollService.test.ts` (22 rewritten)                                                           | NEW/REWRITTEN                                                                                                                       |
| Consumer mock-path fixes | `tests/actions/inventory.test.ts`, `tests/actions/materials.test.ts`, `tests/dashboard/roll-detail-drawer.test.tsx`, `tests/dashboard/settings/materials-page.test.tsx` | MODIFIED — `vi.mock` paths re-pointed to `legacyRollService` / `legacyMaterialTypeService`                                          |

Test suite: 1635 passing, 9 pre-existing failures unrelated to this branch (price-history architecture allowlist gap, cutting-engine NFP rendering, proxy matcher, PO new-page prefill).

## Drift audit — sections we touched

Goal: prove every per-domain README still matches the code that landed.

### ❌ `src/infrastructure/mappers/README.md` — **DRIFT**

The README's "Existing mappers" section lists 4 mappers (supplier, material-supplier, material-type, price-history). The folder now has **5** — `roll.mapper.ts` was added in `b6a03a14` without a README touch. Per the AGENTS.md "definition of done" table this is exactly the kind of drift the index is meant to prevent.

Fix: add a `roll.mapper.ts` row to the README's mapper bullet list (one line, mentions `RollRow` is locally defined because the canonical `supabase.ts` shape is pre-redesign and stale).

### ❌ `di/README.md` — **DRIFT** (predates this commit too)

The token catalog has only two tables: "Services (27)" and "Use cases (9)". `tokens.ts` actually exports **5 repository tokens** (`IMaterialSuppliersRepository`, `IMaterialTypesRepository`, `IPriceHistoryRepository`, `IRollsRepository`, `ISuppliersRepository`) under a clearly-labelled `// Repositories` block. None of them appear in the README. Three of the five (`Suppliers`, `MaterialSuppliers`, `MaterialTypes`, `PriceHistory`) predate this session — only `IRollsRepository` is new in `b6a03a14`. So this drift has been growing over the last four DDD migrations.

Also missing from the Services table: `IMaterialSupplierService` (added in `c3d9a4ef`) and `IUpdateMaterialPricingUseCase` from the Use-cases table (added in `1b2c7be6`).

Fix: add a `### Repositories (5)` table after Services; add the missing Services + Use-cases rows.

### ✅ `src/application/services/README.md` — clean

`IRollService` interface was rewritten but neither added nor renamed, so per the README's stated drift rules ("If you add, remove, or rename…") no row update was required. The service entry is still accurate at the catalog level. The signature change isn't surfaced — fine for the index; PR description carries that nuance.

### ✅ `src/entities/README.md` — clean

`Roll` entity wasn't added in this session (it shipped in `42cd35e8`). Catalog rows still accurate.

### ✅ `src/application/use-cases/README.md` — clean

No use-cases added or renamed in this commit.

### ✅ `app/actions/README.md` — clean

No actions added or renamed.

## Branch-level view (since `dev`)

20 commits, two phases:

**Phase 1 — Entity layer (`733340e7` → `ea3e3737`, 9 commits)**

- 35+ entities across tenancy, contacts, inventory, operations, commerce
- 925+ entity unit tests
- Discoverability indexes added (`e6cbf586`)

**Phase 2 — Service migrations + tooling (`d4805f21` → `b6a03a14`, 11 commits)**

- ts-morph guardrail scripts + snapshot/callers protocol + `/snapshot-diff` slash command (`605a8b8c`, `446569c4`)
- 5 DDD service migrations following the same template: supplier → material-supplier → material-type → price-history → roll
- First orchestration use-case: `UpdateMaterialPricingUseCase` (`1b2c7be6`)

Remaining queue (5 services): `reorderService` → `purchaseOrderService` → `cutService` → `cutHistoryService` → `notificationService`.

## Database-migration branch — what it set up underneath us

`refactor/arc-25-multi-tenancy` (single commit `7248a06f`, +3693/-7774 LOC, merged into `feature/DDD-implementation` as its starting point):

- 10 base migrations rebuilt drop-and-replay style — `tenant_id` on every operational table; no backfill
- RLS rewritten through `auth_user_tenant_ids()`; all tables RLS-on
- Native mm + cents units (`width_mm`, `length_mm`, `thickness_mm`, `cost_per_sqm_cents`)
- New `jobs` hybrid aggregate (parts + assignees + roll-allocations as VO collections)
- Race-safe PO numbering, tenant-scoped storage bucket RLS
- Two further migrations on the same branch: invitations schema + admin schema

Net effect: schema is already DDD-aligned. The application layer (this branch) is catching up to it, one service per commit.

## Tracking approach — claude-mem vs. a checked-in summary

**Insight on the user's question.** They're not interchangeable; they answer different questions and the cost/upside profile is different.

|                 | claude-mem observations                                                                | This file                                                     |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Granularity     | Per-thought (50–60 obs per session)                                                    | Per-session synthesis                                         |
| Persistence     | Local sqlite, agent-only                                                               | Checked into repo                                             |
| Best for        | Recovering "did we already try X" / pulling raw evidence into a future agent's context | Auditable record of what shipped + what indexes need touching |
| Cost            | Free to write (auto-captured); auto-injected into future sessions                      | Manual to write; lives forever in git                         |
| Drift detection | None — observations are point-in-time facts, not contracts                             | Strong — forces you to walk the touched READMEs and compare   |

**Recommendation.** Use both, but for different jobs:

1. **For "what did the work do" → lean on claude-mem + `git log`.** They're already there. Pulling claude-mem observation IDs into this file is duplication: the IDs (S166, S172, 503, etc.) won't survive context resets cleanly for a human reader weeks later, and the per-commit message in git is the durable, reviewable artifact.
2. **For "what's drifted" → this file is the right place.** Claude-mem captures observations _as the work happens_; it doesn't audit the resulting state. The drift section above (✅/❌ per README) is the part that justifies keeping `work_summary/` checked in — it's a single grep target for "are the indexes in sync" instead of re-deriving from scratch every session.
3. **Keep this file thin.** It's not a changelog (commit messages own that) and not a journal (claude-mem owns that). It's a per-session audit + a list of follow-ups. The next session reads the drift section first.

If you treat this as the canonical drift audit, the natural next step after each session is two short fixes (`mappers/README.md` + `di/README.md`), then move on.

## Follow-ups out of this session

1. Patch the two drifted indexes (mappers + DI) — ~10-line edits each. Can ship in a tiny `docs(agents):` commit on this branch.
2. Continue the DDD queue when ready: `reorderService` is the natural next target (closes the pricing-stack family that supplier/material-supplier/material-type/price-history started).
3. The 9 pre-existing test failures remain pre-existing — don't conflate them with new work.
