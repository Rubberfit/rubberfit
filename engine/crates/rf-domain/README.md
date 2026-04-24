# rf-domain

Pure Rust domain types for the RF backend service (S3). Zero
framework or I/O dependencies — this crate compiles against
`serde` + `thiserror` and nothing else from the workspace.

## Layer rules

- **Consumers**: `rf-application` (for Port signatures),
  `rf-supabase` (to materialize rows as domain types),
  `rf-api` (to serialize DTOs).
- **Dependencies**: nothing in the workspace. No HTTP, no async
  runtime, no database client.
- **Shape**: aggregate roots + value objects + typed IDs +
  domain errors. One aggregate per module; the module is flat
  (`struct`, `impl`, tests) — no sub-hierarchies.

## What lives here

- `Cut`, `Roll`, `Part`, `PurchaseOrder`, `ReorderSuggestion` — the
  core aggregates the Rust backend owns, landing one slice at a time
  across S3a through S3d.
- Custom error enum per aggregate (`CutError`, `RollError`, etc.).
- Typed IDs via `struct RollId(pub String)` pattern, serde-compatible.

## What does NOT live here

- Anything that touches the network (use `rf-supabase`).
- Anything that wires Axum handlers (use `rf-api`).
- Use-case orchestration (use `rf-application`).

## Current state

- `cut` — cut_history + favorites (S3a).
- `inventory` — rolls, material types, suppliers,
  material↔supplier junction (S3b).
- `procurement` — purchase orders, PO items, reorder rules,
  reorder suggestions, CSV import row + PO status / urgency
  enums (S3c Task 1).

See `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md` for
the architectural context and the per-slice migration order.
