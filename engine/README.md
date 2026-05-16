# engine/

Native Rust nesting + backend workspace for RF Portal. Owns the
canonical packer (the TypeScript packing implementations have been
retired) and the S3 backend that the Next.js app proxies to via
`/api/v2/*`.

## Layout

### Packing engine

- `crates/rf-geom/` — geometry primitives (future open-source crate, MIT).
- `crates/rf-layout/` — packing engine (future open-source crate, MIT); depends on `jagua-rs` + `sparrow`. Implements the S2.5 stack: FFD bin-assignment + 2D grid warm-start + sparrow-style Guided Local Search + cross-bin swap orchestrator.
- `crates/pack-cli/` — stdin/stdout delivery binary (stays private). Used for local dev + parity tests; production runs `rf-layout` in-process via the Vercel function.

### Backend (S3)

- `crates/rf-domain/` — domain types + invariants for the Rust backend.
- `crates/rf-application/` — use-case ports + orchestration.
- `crates/rf-supabase/` — Supabase repository implementations.
- `crates/rf-api/` — Axum HTTP delivery layer. Mounts the routes the Next.js `/api/v2/*` handlers proxy to (cuts, inventory, procurement). OpenAPI schema lives at `crates/rf-api/openapi.json`; regenerated via `npm run openapi:dump`.

## Build

```bash
cargo build --release           # release binary at target/release/pack-cli
cargo test                      # unit + integration tests
cargo clippy --all-targets      # lint
cargo fmt                       # format
```

Or from the repo root: `npm run build:engine`, `npm run test:rust`.

## Clean architecture

Each crate follows a three-layer split mirroring the TypeScript codebase:
- `src/domain/` — pure types, invariants, no deps beyond stdlib + serde
- `src/application/` — operations on domain types, no vendor types in signatures
- `src/infrastructure/` — vendor adapters (clipper2, jagua-rs, sparrow)

`pack-cli` is the delivery layer (stdin/stdout), equivalent to `app/` in the TS repo.
