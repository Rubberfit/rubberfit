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

---

# Continuation (same day, post-handoff)

Three additional commits landed after the initial drift-audit work. The DDD queue moved from 5/10 to 7/10 services migrated.

## What shipped (continuation)

| Commit     | Title                                                                                      | Files | LOC        |
| ---------- | ------------------------------------------------------------------------------------------ | ----- | ---------- |
| `d4c9dc43` | `docs(agents):` patch mapper + DI indexes for DDD service migrations                       | 2     | +26/-6     |
| `e51c4249` | `docs(work-summary):` add 2026-05-12 session summary + drift audit                         | 1     | +114       |
| `ad31376c` | `feat(infrastructure):` reorder service — sixth DDD migration + interface split            | 24    | +1224/-602 |
| `844e6dcb` | `feat(infrastructure):` purchase-order service — seventh DDD migration (commit 1/2: infra) | 36    | +2100/-764 |

## Migration details

**Sixth migration — `reorderService` (`ad31376c`)**

Wider-than-usual interface split because the 22-method legacy surface bundled 4 concerns (rule CRUD / suggestion generation / calculation pass-throughs / PO numbering). Codex review (per durable feedback) identified 7 unreachable-from-production methods to drop: `checkReorderPoints`, `createAutomaticPurchaseOrder`, `calculateSuggestedQuantity`, `estimateReorderCost`, `determineUrgency`, `generateReorderReason`, `calculateOptimalOrderQuantity`. Also `generatePONumber` (canonical lives on `purchaseOrderService`). Narrow new `IReorderService` is 11 entity-typed methods over `IReorderRulesRepository`; legacy shim retains rule raw-row CRUD + inline `generateReorderSuggestions` + `calculateCurrentStock` for the 4 consumer files that still need them.

**Seventh migration — `purchaseOrderService` commit 1/2 (`844e6dcb`)**

Biggest migration to date — 688-LOC service, 796-LOC entity, 22-method surface, 8 consumers, 5 PO use-cases injecting it. Codex review revised scope:

- **Split commits**: this is 1 of 2. Commit 2/2 will rewrite the 5 PO use-cases to adopt the new entity-typed surface (confronts the tenant-resolution problem — `ActionActor` has no `tenantId` today, entity factories require one) and migrate consumer page imports. Both commits must compile green.
- **First nested-aggregate mapper**: PO header + `PurchaseOrderItem` VO collection rehydrated from joined rows. Currency injected externally (DB stores cents only). `repo.update(po)` syncs child rows by `(purchase_order_id, line_number)` — UPDATE on existing, INSERT new, soft-delete dropped — avoiding row-id churn on status-only updates.
- **Service hides `load → mutate → save`**: every entity-typed method internally fetches the aggregate, calls the entity transition, persists. Use-cases stay thin.
- **Deferred**: `IPoNumberingService` extraction (DB RPC-backed, race-safe) is its own follow-up commit; `generatePONumber` stays on legacy shim for now. `recalculatePOTotals` deliberately not on new service — aggregate maintains the money invariant automatically.

Use-cases temporarily flipped `@inject` from `TOKENS.IPurchaseOrderService` → `TOKENS.ILegacyPurchaseOrderService` (mechanical edit; zero behavior change). 7 consumer files repathed imports from `purchaseOrderService` → `legacyPurchaseOrderService`.

## Test totals

| Checkpoint                       | Passing | Failing | Notes                                                                           |
| -------------------------------- | ------- | ------- | ------------------------------------------------------------------------------- |
| Start of session (`b6a03a14`)    | 1635    | 9       | Rollservice migration just shipped.                                             |
| After reorder (`ad31376c`)       | 1654    | 9       | +19 net new passing (mapper 14 + service 13, −8 changes due to method renames). |
| After PO commit 1/2 (`844e6dcb`) | 1672    | 9       | +18 new (mapper 8 + service 10).                                                |

All 9 failures are pre-existing and unrelated to migrations: cutting-engine NFP rendering (7), proxy matcher (1), po-new-page prefill (1), price-history architecture allowlist gap (1 — Codex caught this on a separate run; affects `tests/architecture/no-direct-supabase.test.ts`).

## Drift audit — continuation

Same methodology as the initial audit. All indexes touched by these commits are now verified in sync:

| Index                                             | Status | Notes                                                                                                                                           |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/infrastructure/mappers/README.md`            | ✅     | 7 mappers listed, 7 on disk. PO mapper added with nested-aggregate notes.                                                                       |
| `di/README.md` Services (29)                      | ✅     | All 29 tokens accounted for; `ILegacyReorderService` + `ILegacyPurchaseOrderService` added; class flips marked for the 7 DDD-migrated services. |
| `di/README.md` Repositories (7)                   | ✅     | All 7 DI-registered repos listed: Suppliers, MaterialSuppliers, MaterialTypes, PriceHistory, Rolls, ReorderRules, PurchaseOrders.               |
| `di/README.md` Use cases (10)                     | ✅     | 10 use-cases on disk, 10 in README.                                                                                                             |
| `src/application/services/README.md` Catalog (29) | ✅     | Catalog count matches; both `ILegacyXxxService` rows added with retire-on-consumer-migration notes.                                             |
| `src/application/use-cases/README.md`             | ✅     | No use-cases added/renamed in these commits — just `@inject` token flips (interior change).                                                     |
| `src/entities/README.md`                          | ✅     | No entity files added/renamed.                                                                                                                  |

**Observation, not drift:** `jobs.repository.ts`, `notifications.repository.ts`, `profiles.repository.ts` exist on disk but aren't DI-registered (no token, no row in `di/README.md` Repositories table). They're consumed via direct module imports by their services. Consistent with the DI README's stated scope (tracks DI tokens, not all repository files). Worth a follow-up note when those services hit the DDD migration queue.

## DDD queue status

**Done (7/10):** supplier, material-supplier, material-type, price-history, roll, reorder, purchase-order (infra surface only — use-case rewrite + consumer migration pending in commit 2/2).

**Remaining (3 + 1 follow-up):**

1. **PO commit 2/2** — rewrite 5 PO use-cases to adopt the new entity-typed `IPurchaseOrderService`. Confronts tenant resolution (`ActionActor.tenantId` doesn't exist; entity factories require `TenantId`). Migrate 7 consumer page imports back off the legacy shim where feasible. Update mocks.
2. **`cutService`** — granular per-piece cut log. Smaller scope, narrow consumer set.
3. **`cutHistoryService`** — job-level cut record (aggregate root). Joined query for layout JSON + linked rolls.
4. **`notificationService`** — careful one. Two-table dance per CLAUDE.md (`notifications` in-app feed vs `notification_queue` async dispatch). Lots of consumers (every action that fires a notification side-effect).

Plus the **`IPoNumberingService` extraction** (DB RPC-backed, race-safe) flagged by Codex during the PO scope review — its own follow-up commit between or after the rest.

## Follow-ups out of continuation

1. **PO commit 2/2** is the most urgent — leaving the use-cases mid-flight (pointed at legacy shim while new service exists unused) is technically working but architecturally awkward. Should be completed in the next session.
2. **Tenant resolution decision** before commit 2/2 lands: extend `ActionActor` with `tenantId`, or derive from supplier/job context at the use-case level? This is Codex's open flag, not a small refactor.
3. **Pre-existing test failures** (still 9). Architecture allowlist gap for the price-history files is the easiest fix; the cutting-engine NFP failures need real investigation (7 of the 9).
