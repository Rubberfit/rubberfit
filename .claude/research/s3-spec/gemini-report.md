# S3 spec research — Rust backend service + Supabase port (Gemini)

## 1. Recommended Stack

To support a seamless migration from Next.js to a Tauri desktop application (S4) while maintaining strict architectural boundaries, the Rust backend should be built on the following stack:

*   **HTTP Framework: Axum + Tower.** Axum is the industry standard for Tokio-based asynchronous web services. It provides unparalleled ergonomics, deep integration with the Tower ecosystem (middleware, tracing, CORS, rate-limiting), and zero-cost abstractions. Crucially, an Axum router can easily be adapted later in S4 to run either as a localhost HTTP server in a Tauri sidecar or seamlessly bound to Tauri's IPC without rewriting the core handlers.
*   **Supabase Integration: `postgrest` (HTTP) + `reqwest`.** While `sqlx` provides excellent raw database access, Supabase relies heavily on PostgREST to enforce Row-Level Security (RLS) via the JWT context. Simulating RLS with `sqlx` in a connection pool requires executing `set_config()` transactions before every query, which is notoriously prone to session leakage and security vulnerabilities. By using the `postgrest` Rust crate (an HTTP client mimicking `supabase-js`), the Rust backend can simply forward the user's JWT in the `Authorization` header. This flawlessly preserves Supabase's native RLS without risking connection-state pollution.
*   **Type Safety Across the Wire: `ts-rs`.** For internal APIs between our Next.js/Tauri frontend and Rust backend, OpenAPI/utoipa is overly verbose. `ts-rs` is the optimal choice. By adding `#[derive(TS)]` to our Rust structs and configuring `export_to`, we can automatically emit perfectly matched TypeScript interfaces into `src/infrastructure/api-client/types.ts` during the existing `npm run build:engine` step. This guarantees runtime shape safety with zero manual type synchronization.

## 2. Entity Layer Design

The current Next.js application relies on anemic TS interfaces and places all logic in `use-cases/`. Rust excels at data-oriented design, allowing us to build a rich but lightweight Entity layer.

Rather than adopting heavy DDD patterns with interior mutability, the Rust entity layer should consist of **Simple Structs + State Enums**. 
*   **Structs** (e.g., `PurchaseOrder`, `CutJob`) will map directly to the database schema.
*   **Enums** will enforce valid domain states (e.g., `POStatus::Draft`, `POStatus::Sent`).
*   **Impl blocks** will contain pure business logic (e.g., `po.calculate_eoq()`, `cut_job.can_transition_to(Status::Completed)`). 

This approach keeps the entities highly testable and completely decoupled from the database infrastructure. Use cases (orchestrators) will fetch the struct via PostgREST, call its methods to mutate state or calculate values, and persist it back.

## 3. Migration Phasing

Migrating ~20 services requires a progressive, hard-cutover-per-service strategy running both backends in parallel. We will configure Next.js `next.config.mjs` to proxy `/api/v2/*` to the Rust server.

*   **Phase S3a: Scaffolding & Foundational Read-Only Port.** 
    *   Create the `rema-api` crate in `engine/Cargo.toml`.
    *   Setup the Axum server, `ts-rs` generation pipeline, and JWT verification middleware.
    *   Port 1–2 simple, read-only domains (e.g., `TaxService`, `MaterialTypeService`).
    *   **Exit Criteria:** Next.js UI accurately displays tax rates fetched via the Rust proxy endpoint.
*   **Phase S3b: Packing API & SSE.**
    *   Eliminate the `pack-cli` binary. Expose an Axum POST endpoint (`/api/v2/pack`) that invokes the S2.5 engine directly in-memory.
    *   Implement Server-Sent Events (SSE) to stream `bestLayoutSoFar` progress, replacing the Node `child_process` NDJSON stdout parsing. 
    *   **Exit Criteria:** The frontend Cut Planner successfully drives the engine via HTTP SSE with zero latency overhead.
*   **Phase S3c: Complex Business Logic Port.**
    *   Port the heavy use-cases: Purchase Orders, Reorder Calculations, and Cut History.
    *   Implement transactional-like orchestration (since PostgREST lacks true multi-statement transactions, we must design idempotent orchestration steps or leverage Supabase RPCs for atomic operations).
    *   **Exit Criteria:** PO creation, inventory updates, and waste classification are fully governed by Rust.
*   **Phase S3d: Side-Effects & Wrap-up.**
    *   Port `NotificationService` and `EmailService`.
    *   Implement the token-bucket rate limiter and content-hash deduplication for notifications natively in Rust.
    *   Deprecate and delete the legacy TS `src/application` and `src/infrastructure` layers.

## 4. Risk Areas

*   **RLS Bypass:** The most severe risk. If the Rust backend initializes a PostgREST client using the Supabase `SERVICE_ROLE` key instead of the request's JWT, it will bypass RLS. *Mitigation:* The Axum dependency-injection structure must strictly prohibit injecting a global PostgREST client. The client must be instantiated per-request inside the handler, seeded strictly with the JWT extracted from the `Authorization` header.
*   **Schema Drift:** As the TS backend is deprecated, Supabase migrations will still exist. If the DB schema changes, the Rust structs might fail to deserialize. *Mitigation:* Integrate `ts-rs` early, and establish strict `#[serde(default)]` and `#[serde(rename_all = "camelCase")]` disciplines.
*   **PostgREST Transaction Limits:** Complex operations (like PO creation + Notification queueing) were previously executed as sequential DB calls. If one fails, we risk partial state. *Mitigation:* Move multi-table atomic operations into Supabase PL/pgSQL RPC functions, and have the Rust service call the single RPC endpoint.

## 5. Minimum Viable First Cut (S3a)

The S3a release should be explicitly minimal to validate the cross-boundary compilation, proxying, and auth flow. 

**Scope:**
1. Standalone `rema-api` Rust binary that boots an Axum server.
2. Axum middleware that intercepts requests, validates the Supabase JWT signature (using `HS256` and the anon key), and rejects unauthorized requests.
3. Implementation of the `TaxService` (currently hardcoded 8% fallbacks in TS).
4. `ts-rs` emitting `ITaxResponse` to the TS codebase.
5. Next.js configured with an `/api/v2/tax` rewrite rule.
6. Updating `app/api/tax-rates/` or the TS `taxService.ts` to fetch from the Rust API instead of Supabase directly.

## 6. Proposed Timeline / Scope Estimate

Given the S2.5 engine is complete, the S3 backend migration is a medium-to-large effort:

*   **S3a (Foundation & Tax):** 1 Week. High infrastructure overhead, low domain complexity.
*   **S3b (Pack HTTP & SSE):** 1.5 Weeks. Re-wiring the CLI pipeline to async streams in Axum requires careful thread-pool management (using `tokio::task::spawn_blocking` to avoid starving the async reactor with the CPU-bound nesting engine).
*   **S3c (POs & Inventory):** 2.5 Weeks. Heavy lifting. Translating the `reorderCalculations.ts` math into robust Rust entities and ensuring float precision matches.
*   **S3d (Notifications/Emails):** 1 Week. Implementing rate-limiting and finalizing the deletion of legacy TS code.
*   **Total Scope:** ~6 Weeks of dedicated engineering.

## 7. Open Questions That Need User Input

1.  **Deployment during S3 vs S4:** While S4 targets a Tauri desktop deployment (where the Rust binary runs as a sidecar via localhost), how will we deploy S3 *before* S4 is ready? Do we containerize the Rust API alongside Next.js on a VPS, or deploy the Rust API to a service like Shuttle.rs/Render while Next.js stays on Vercel?
2.  **RPCs vs Sequential Calls:** For complex use-cases (e.g., creating a PO and generating 3 notification rows), do you prefer keeping the orchestration logic in Rust (making 2 sequential PostgREST HTTP calls) or writing Supabase PL/pgSQL RPCs for true atomicity?
3.  **Testing Strategy Validation:** To test the S3 services, do you approve introducing `testcontainers-rs` to spin up ephemeral Postgres/Supabase containers in the CI pipeline? This guarantees exact RLS behavior testing but adds ~30s to the CI loop.
