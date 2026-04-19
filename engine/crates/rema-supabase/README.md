# rema-supabase

Supabase REST adapter for the REMA backend (S3). Concrete
implementations of the Port traits from `rema-application`, all via
`reqwest` against the Supabase PostgREST endpoint.

## Layer rules

- **Consumers**: `rema-api` only — API handlers resolve repository
  impls at request time with the user's JWT threaded through.
- **Dependencies**: `rema-domain`, `rema-application`, `reqwest`,
  `serde_json`.
- **Auth**: every request carries the user's JWT. RLS enforces
  per-user scoping at the Postgres layer. The service role key must
  never be used by this crate (explicit S3 spec constraint).

## What lives here

- `SupabaseRollRepository`, `SupabasePurchaseOrderRepository`,
  `SupabaseNotificationSink`, etc. — one struct per Port trait, each
  parameterized by the user's JWT at construction time.
- Row-to-aggregate mappers (private helpers per module).
- Supabase-specific error handling (timeouts, 4xx → typed errors).

## What does NOT live here

- Use-case orchestration (use `rema-application`).
- HTTP handler wiring (use `rema-api`).
- Any fallback or caching logic beyond what Supabase provides.

## Current state

Empty scaffold. Concrete repositories populate as the aggregates
migrate in S3a-S3d.
