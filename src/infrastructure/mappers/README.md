# Mappers

`src/infrastructure/mappers/` is the boundary layer between persistence
rows (`snake_case` shapes returned by Supabase) and domain entities
(`camelCase`, branded IDs, Money + Email VOs). Repositories own the
SQL; mappers own the row-to-entity translation.

## When to add a mapper

Add one when you migrate a domain to DDD entities. Each aggregate root
in `src/entities/` should have exactly one mapper file. Child VOs that
live inside an aggregate (e.g., `PurchaseOrderItem`, `JobAssignee`) are
reconstituted by the parent mapper, not by their own file.

Do **not** add a mapper for:

- DTOs returned by joined queries (`MaterialSupplierWithDetails`,
  `PurchaseOrderWithDetails`) — those stay as flat row types until
  the consuming use-case is itself DDD-wired.
- Read-models / projections that have no entity counterpart.

## File shape

```ts
// src/infrastructure/mappers/<aggregate>.mapper.ts

import { <Aggregate> } from "@/src/entities/<aggregate>"

export interface <Aggregate>Row { /* snake_case persistence shape */ }
export interface <Aggregate>InsertRow { /* insert payload */ }
export type <Aggregate>UpdateRow = Partial<Pick<<Aggregate>Row, /* mutable cols */>>

export function rowTo<Aggregate>(row: <Aggregate>Row): <Aggregate> {
  return <Aggregate>.reconstitute({ /* unpack VOs + branded IDs */ })
}

export function <aggregate>ToInsertRow(entity: <Aggregate>): <Aggregate>InsertRow {
  return { /* re-flatten VOs to columns */ }
}

export function <aggregate>ToUpdateRow(entity: <Aggregate>): <Aggregate>UpdateRow {
  return { /* mutable columns + updated_at / updated_by + deleted_at */ }
}
```

## Rules

1. **Mappers never import services or repositories.** They depend on
   entity + value-object code only. Importing a service creates a
   layering loop and breaks unit testability.

2. **Define row types locally.** Do not import from
   `@/src/infrastructure/models/supabase` — the legacy shapes there
   are pre-redesign and out of sync with the actual schema. The
   mapper's row type is the authoritative persistence shape until the
   Supabase generator catches up.

3. **Money columns use a default currency at the read boundary.**
   The DB column stores cents; the mapper picks a currency (USD until
   per-tenant currency lands) when constructing the Money VO.

4. **Insert vs. update vs. row shapes are distinct types.** Inserts
   omit `id` / `created_at` / `updated_at` (DB defaults); updates only
   touch mutable columns plus the audit fields the entity tracks.

5. **Failure mode = throw.** If a row violates an entity invariant,
   `Entity.reconstitute()` throws — the mapper does not silently coerce.
   Treat any throw as a data-integrity bug and surface it.

## Test pattern

Mapper tests are pure-function tests; no DI, no Supabase. Round-trip a
row through `rowTo<Aggregate>` → `<aggregate>ToInsertRow` and assert
the persistence-relevant fields are preserved. Tests live alongside
the mapper at `tests/infrastructure/mappers/<aggregate>.mapper.test.ts`.

## Existing mappers

- `supplier.mapper.ts` — first mapper, established the convention.
- `material-supplier.mapper.ts` — junction-table mapper. `cost_per_sqm_cents` hydrates into a Money VO with a tenant-level default currency (USD until the per-tenant currency column lands); `effective_date` / `expiration_date` are `date` columns, round-tripped through `toISOString().slice(0, 10)`.
- `material-type.mapper.ts` — tenant-scoped material catalog. No VOs beyond branded IDs (pricing lives on `material_suppliers`, not here).
- `price-history.mapper.ts` — append-only audit table. No `*ToUpdateRow` (the row is immutable once written). `old_cost_per_sqm_cents` is nullable for the first-ever price; both costs hydrate into Money VOs with the default USD currency.
- `roll.mapper.ts` — physical stock aggregate. `RollRow` is locally defined (the generated `Roll` row type in `supabase.ts` is pre-redesign and stale); covers the mm-native dimensions (`width_mm`, `length_mm`, `thickness_mm`, `remaining_length_mm`), `cost_per_sqm_cents` → Money VO (USD default), `source_type` (`received` / `offcut`), offcut lineage (`source_cut_history_id`, `parent_roll_id`), and the barcode / QR audit columns. `date_received` is a `date` column round-tripped through `toISOString().slice(0, 10)`.
