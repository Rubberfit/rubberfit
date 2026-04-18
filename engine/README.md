# engine/

Native Rust nesting engine for REMA Portal. Replaces the TypeScript `LegacyPackingService` behind `IPackingService` via a JSON stdin/stdout CLI binary.

## Layout

- `crates/rema-geom/` — geometry primitives (future open-source crate, MIT)
- `crates/rema-layout/` — packing engine (future open-source crate, MIT); depends on `jagua-rs` + `sparrow`
- `crates/pack-cli/` — stdin/stdout delivery binary (stays private)

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
