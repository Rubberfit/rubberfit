# pack-cli

Single-shot stdin/stdout JSON delivery for the RF nesting engine.

```bash
echo '<PackRequest JSON>' | pack-cli > result.json
```

- Reads one JSON `PackRequest` from stdin (buffered until EOF).
- Resolves the strategy (`request.engine`, falling back to `RF_ENGINE`).
- Writes one JSON `PackResult` to stdout on success.
- Writes a diagnostic to stderr on failure.
- Exit code: `0` on success, `1` on any read / parse / pack / serialise failure.

The previous `--stream` NDJSON + stdin-cancellation protocol was removed
when the browser dropped the streaming short-circuit. The TS layer now
makes a single fetch round-trip — there are no progress frames and no
cancel signal, so this binary stays single-shot.

## Strategy selection

The packer dispatches via `rf_layout::application::strategy::strategy_for`.
Resolution priority:

1. `request.engine` (in-band, request-level — `Default` / `Legacy` / `Lbf`).
2. `RF_ENGINE` env var — `"legacy"` / `"lbf"` / anything else (incl. unset) → `Default`.

Request-level wins so the client can choose per-request without controlling
the server env. The env var is a legacy escape hatch + CI knob.

## Build

From the workspace root (`engine/`):

```bash
cargo build --release -p pack-cli
# binary at: engine/target/release/pack-cli
```

Or from the repo root: `npm run build:engine`.

## Architecture

This crate is the **delivery layer** in the clean-architecture split of
the Rust engine. It owns zero packing logic — it only reads stdin,
parses JSON into `rf_layout::domain::PackRequest`, dispatches to a
`NestingStrategy`, and serialises the result to stdout. All behaviour
changes happen in `rf-layout`, not here.

Consumers:

- Browser (production) — `POST /api/v2/pack` lands on the Vercel Rust
  serverless function (`api/v2/pack.rs`), which runs the packer
  **in-process** via the `rf-layout` crate. `pack-cli` is not invoked.
- Server (local dev) — the Next.js route handler at
  `app/api/v2/pack/route.ts` spawns `pack-cli` via `child_process.spawn`
  through the `RustPackingService` adapter in
  `src/infrastructure/services/`.
- Parity tests — `tests/packing/parity/parity.test.ts` spawns the
  binary directly.
