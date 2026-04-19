# rema-application

Application layer for the REMA backend (S3). Defines Port traits —
the abstract interfaces the use cases depend on — and hosts the
use-case orchestration code that coordinates them.

## Layer rules

- **Consumers**: `rema-api` (to resolve use cases per request),
  `rema-supabase` (to implement the Port trait surfaces).
- **Dependencies**: `rema-domain` only. No HTTP, no `reqwest`, no
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

- HTTP handlers, middleware, DTO serialization (use `rema-api`).
- Supabase client code (use `rema-supabase`).
- Raw SQL — the application layer shouldn't know the data source.

## Current state

Empty scaffold. Ports + use cases populate as S3 tasks land.
