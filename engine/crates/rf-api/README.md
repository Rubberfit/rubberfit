# rf-api

Axum HTTP delivery layer for the RF backend (S3). Maps REST
requests to use-case calls via the Ports in `rf-application`,
resolving concrete repositories (`rf-supabase`) per request.

## Layer rules

- **Consumers**: end users (HTTP) and the Next.js frontend as a
  reverse-proxy target.
- **Dependencies**: all three inner crates (`rf-domain`,
  `rf-application`, `rf-supabase`) + Axum + middleware stack
  + `utoipa` for OpenAPI.
- **Auth**: JWKS/RS256 verification middleware (Task 3) extracts a
  user `AuthContext` and passes it to every request handler.

## What lives here

- `main.rs` — binary entrypoint: boots Axum, loads config, binds
  port, installs middleware, mounts routes.
- `lib.rs` — the router factory, middleware, DTO types, OpenAPI
  schema assembly. Integration tests construct the router via this
  library interface.
- Per-resource handler modules as each aggregate ships: `cuts`,
  `rolls`, `purchase_orders`, etc.
- Middleware: auth, request-ID, timeout, CORS, error mapping.

## What does NOT live here

- Business logic — call into `rf-application` use cases.
- SQL or direct Supabase I/O — goes through `rf-supabase`.
- Domain invariants — defer to `rf-domain` types.

## Current state

S3a shipped (`s3a-foundation` tag) — cut-history.
S3b shipped (`s3b-inventory` tag) — inventory aggregates.
S3c in progress — procurement (POs + reorder + CSV import).
Task 1 lands the domain scaffold, `NotificationPort` + `TaxPort`
traits, the `procurement` tag on the merged OpenAPI doc, and a
migration that ports `generate_po_number()` to a per-year
`SEQUENCE` plus empty-shell RPCs for Tasks 5 and 7.

### S3a surface

- `GET /api/v2/cuts/history` — list with `limit`/`offset`/`since`/`until`.
- `GET /api/v2/cuts/history/{id}` — single entry.
- `GET /api/v2/cuts/favorites` — favorites list.

### S3b surface (inventory, full CRUD)

- `/api/v2/inventory/material-types(/id)` — CRUD for the material-type
  master list. Unique `name`; FK violations on delete return 409
  with `FK_VIOLATION_ROLLS_EXIST`.
- `/api/v2/inventory/suppliers(/id)` — CRUD + `active`/`preferred`/`q`
  filters. Rating validation 0–5.
- `/api/v2/inventory/material-suppliers(/id)` — junction table CRUD.
  GET responses embed the referenced material type + supplier.
  Unique `(material_type_id, supplier_id)` → 409 `DUPLICATE_PAIR`.
- `/api/v2/inventory/rolls(/id)` — CRUD + search (`q=`). Server-side
  hydration of the denormalized `material_type` string from the
  FK. Depletion requires both `status=depleted` AND
  `remaining_length=0` — rejected with `INVALID_DEPLETION_STATE`
  otherwise (matches the DB trigger gate).
- `/api/v2/inventory/rolls/stats/inventory-value` — Σ (w × r / 144)
  × effective_cost (USD).
- `/api/v2/inventory/rolls/stats/low-stock-count` — count of
  material types whose aggregate sqft falls below their
  `min_stock_alert`.
- `/api/v2/inventory/rolls/stats/growth-percentage` — % growth
  in roll count last-7d vs. prior-7d.
- `/api/v2/inventory/rolls/recent?limit=N` — most-recent active rolls.

### Shared plumbing

- Request-scoped PostgREST client (S3a Task 4) — every call carries
  the caller's JWT so RLS scopes rows to the user.
- OpenAPI doc merged from per-domain structs (`MetaDoc`, `CutsDoc`,
  `InventoryDoc`) via `build_doc()`. Served at `/openapi.json` and
  dumped to the committed `openapi.json`.
- Error contract: 400 validation, 404 not-found, 409 Conflict with
  `{ "code": "STABLE_MACHINE_CODE" }` body, 500 infrastructure
  (generic body; full error in logs), 401/503 on JWKS path.

Routes are assembled via `build_router_with_state(cfg, state)`.
`AppState` carries two factory traits:
- `CutHistoryPortFactory` — S3a.
- `InventoryPortFactory` — S3b, builds `MaterialTypePort`,
  `SupplierPort`, `MaterialSupplierPort`, `RollPort`.

Tests inject fakes; production uses `SupabaseCutHistoryFactory`
and `SupabaseInventoryFactory` respectively.

## Running

```bash
cargo run -p rf-api
# → listens on RF_API_BIND (default 127.0.0.1:8080)
# → GET /health returns { "status": "ok", ... }
# → GET /openapi.json returns the OpenAPI 3.1 document
# → GET /api/v2/cuts/history requires a Supabase JWT (RS256)
```

## Regenerating the OpenAPI spec

```bash
# After changing any #[utoipa::path] or ToSchema DTO:
npm run openapi:dump    # → engine/crates/rf-api/openapi.json
npm run openapi:types   # → src/infrastructure/api-client/types.ts
```

CI runs `npm run openapi:check` to diff the committed spec against a
freshly generated one and fails on drift.

## Deploying to Fly.io (Task 9)

Manifests live in `engine/`:

- `engine/Dockerfile` — multistage Rust build → distroless runtime.
- `engine/fly.toml` — app config: single region (`sjc`), autoscale
  0-1, `/health` probe.
- `engine/.dockerignore` — excludes `target/`, `.claude/`, docs.

Before the first deploy:

```bash
# Launch without deploying so Fly can read fly.toml and provision
# resources without pulling a build.
fly apps create rf-api-archanchor  # one-time, from repo root

fly secrets set \
  SUPABASE_URL=https://PROJECT_REF.supabase.co \
  SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
  --app rf-api-archanchor
```

Deploy:

```bash
fly deploy --config engine/fly.toml
# Fly treats `engine/` as the build context — matches the
# Dockerfile's `COPY crates/...` paths.
```

Health check after deploy:

```bash
curl -fsS https://rf-api-archanchor.fly.dev/health
# → { "status": "ok", "version": "0.1.0" }
```

## Smoke test (Task 9.5 prep)

`scripts/smoke.sh` exercises the three surfaces that must work
end-to-end before flipping `NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true`
in Vercel: `/health`, `/openapi.json`, and `/api/v2/cuts/history`
(with and without a bearer token).

```bash
# Unauth smoke only:
RF_API_URL=https://rf-api-archanchor.fly.dev \
  ./engine/crates/rf-api/scripts/smoke.sh

# Full smoke including authed roundtrip:
RF_API_URL=https://rf-api-archanchor.fly.dev \
RF_API_JWT="$(supabase_jwt_for_test_user)" \
  ./engine/crates/rf-api/scripts/smoke.sh
```

The script fail-fasts on the first broken invariant and never
echoes the full response body (PII-safe).

## Docker build

The Dockerfile is proven to build + run locally via:

```bash
docker build -f engine/Dockerfile -t rf-api:local engine/
docker run --rm -p 8080:8080 rf-api:local
curl -fsS http://localhost:8080/health   # → { "status": "ok", ... }
```

Final image is ~39 MB (distroless/cc + stripped Rust binary). The
actual staging + production deploys happen in Task 9.5 once
secrets are provisioned.
