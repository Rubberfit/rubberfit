# pack-cli

Stdin/stdout CLI for the RF nesting engine.

## Batch mode (default)

```bash
echo '<PackRequest JSON>' | pack-cli > result.json
```

- Reads JSON `PackRequest` from stdin (full buffer until EOF).
- Writes one JSON `PackResult` to stdout on success.
- Writes error message to stderr on failure.
- Exit code: 0 on success, 1 on error.

## Streaming mode (`--stream`) — Task 15

```bash
cat request.json | pack-cli --stream
```

Emits NDJSON (newline-delimited JSON) to stdout:

```
{"iteration":0,"elapsedMs":0,"bestPlacedCount":0,"bestActiveStockDensity":0.0,"phase":"explore"}
{"iteration":1,"elapsedMs":45,"bestPlacedCount":3,"bestActiveStockDensity":0.42,"phase":"explore"}
...
{"placements":[...],"placedCount":5,"overflowCount":0,...,"wasCancelled":false}
```

Protocol:

- The **first JSON value** on stdin is the `PackRequest`.
- Each subsequent stdout line is either a `PackProgress` frame (has `iteration` field, no `placements`) or the final `PackResult` (has `placements` array). The `PackResult` is always the last line.
- Progress frames are monotonic — each one represents a strictly better global incumbent than the previous one (by placed count, then by active-stock density).
- Consumers should parse line-by-line and stop when they see a line with a `placements` field.

### Stdin cancellation

After sending the initial `PackRequest`, the caller can send any number of JSON lines on stdin. A line matching `{"cancel":true}` flips the cancel token; the engine returns promptly with `wasCancelled: true` in the final `PackResult` and whatever best-so-far placements it had.

```bash
# Example (bash): run for 5s budget, cancel after 500ms
(
  cat request.json
  sleep 0.5
  echo '{"cancel":true}'
) | pack-cli --stream
```

Cancel latency: ~100ms product SLA, ≤500ms CI cap. Latency is bounded by the depth of cancel polling inside the GLS inner loop (see `rf-layout/src/infrastructure/search/cancel.rs` + `progress.rs`).

## Build

From the workspace root (`engine/`):

```bash
cargo build --release -p pack-cli
# binary at: engine/target/release/pack-cli
```

## Architecture

This crate is the **delivery layer** in the clean-architecture split of the Rust engine. It owns zero packing logic — it only reads stdin, parses JSON into `rf_layout::domain::PackRequest`, calls `rf_layout::application::pack` (or `pack_with_options` for `--stream`), and serializes the result to stdout. All behavior changes happen in `rf-layout`, not here.

TypeScript callers invoke this binary via `child_process.spawn`. The adapter lives in the `src/infrastructure/services/` layer and is added in S2 Phase 10.
