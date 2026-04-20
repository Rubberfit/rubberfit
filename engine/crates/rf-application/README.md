# rf-application

Application layer for the RF backend (S3). Defines Port traits —
the abstract interfaces the use cases depend on — and hosts the
use-case orchestration code that coordinates them.

## Layer rules

- **Consumers**: `rf-api` (to resolve use cases per request),
  `rf-supabase` (to implement the Port trait surfaces).
- **Dependencies**: `rf-domain` only. No HTTP, no `reqwest`, no
  Axum, no async runtime in the trait signatures (use `async fn` via
  `async_trait` for Ports).
- **Shape**: one Port trait per aggregate repository, one use-case
  struct per business intent. Use cases are constructed with
  dependency-injected Port trait objects so tests can substitute
  fakes.

## What lives here

- `ports::*` — trait definitions: `RollRepository`,
  `PurchaseOrderRepository`, `NotificationSink`, etc.
- `use_cases::*` — orchestrators that compose ports: `ApprovePurchaseOrder`,
  `GenerateReorderSuggestions`, etc.
- Application-level error types (`AppError`) that wrap domain errors +
  add cross-cutting concerns like "not authorized," "not found."

## What does NOT live here

- HTTP handlers, middleware, DTO serialization (use `rf-api`).
- Supabase client code (use `rf-supabase`).
- Raw SQL — the application layer shouldn't know the data source.

## Current state

- `cuts` — `CutHistoryPort` + list/get/favorites use cases (S3a).
- `inventory` — material types, suppliers, material↔supplier junction,
  rolls (CRUD + filters + stats) (S3b).
- `notifications` — `NotificationPort` trait for procurement-driven
  side effects (approve / receive / reorder-created) (S3c Task 1).
- `tax` — `TaxPort` trait; S3c proxies to the TS tax service, S3d
  will port the logic directly (S3c Task 1).
- `procurement` — module scaffold; purchase-order, reorder, and
  CSV-import ports + use cases land in S3c Tasks 2–8.
