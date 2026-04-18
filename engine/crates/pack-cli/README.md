# pack-cli

Stdin/stdout CLI for the REMA nesting engine.

## Usage

```bash
echo '<PackRequest JSON>' | pack-cli > result.json
```

- Reads JSON `PackRequest` from stdin
- Writes JSON `PackResult` to stdout on success
- Writes error message to stderr on failure
- Exit code: 0 on success, 1 on error

This is a delivery-layer binary. The actual packing logic lives in `rema-layout::application::pack`.

## Build

From the workspace root (`engine/`):

```bash
cargo build --release -p pack-cli
# binary at: engine/target/release/pack-cli
```

## Architecture

This crate is the **delivery layer** in the clean-architecture split of the Rust engine. It owns zero packing logic — it only reads stdin, parses JSON into `rema_layout::domain::PackRequest`, calls `rema_layout::application::pack`, and serializes the result to stdout. All behavior changes happen in `rema-layout`, not here.

TypeScript callers invoke this binary via `child_process.spawn`. The adapter lives in the `src/infrastructure/services/` layer and is added in S2 Phase 10.
