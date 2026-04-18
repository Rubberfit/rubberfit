# rema-layout

2D nesting engine built on jagua-rs (collision engine) and sparrow (LNS+SA optimizer). REMA's proprietary scoring (fabrication score, reusable-offcut classification, intra-blank waste) layers on top of the standard core via a dedicated `proprietary` module.

## Layout

- `src/domain/` — pure types matching `src/application/packing/types.ts` in the TS repo (camelCase serde) + industry-standard synonyms via `#[serde(alias)]`
- `src/application/pack.rs` — pack() orchestrator (Task 18)
- `src/infrastructure/` — jagua-rs adapter, sparrow driver, warm-start (Phase 6)

## Public API (v0.1)

```rust
use rema_layout::application::pack;
use rema_layout::domain::{PackRequest, PackResult};

let request: PackRequest = serde_json::from_str(&json)?;
let result: PackResult = pack(request)?;
```

## Wire format

Field names are camelCase. Industry-common synonyms accepted as aliases:

- `quantity` ↔ `demand` (jagua-rs BPP)
- `clearance` ↔ `kerf` ↔ `spacing` (CAM / Deepnest / libnest2d)
- `efficiency` ↔ `density` (jagua-rs output)

Units default to inches; pass `units: "mm"` to override.
