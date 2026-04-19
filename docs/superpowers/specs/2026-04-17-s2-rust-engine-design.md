# S2 — Rust Nesting Engine

**Status:** Approved design. Ready for implementation plan (`writing-plans` skill next).
**Date:** 2026-04-17
**Sub-project:** S2 of 5 (see `2026-04-17-migration-overview-design.md`)
**Target repo:** `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/`
**Prerequisite:** S1 complete (`s1-canonical-pipeline-complete` tag)

## 1. Context

S1 put the TS packer behind `IPackingService` via DI so the UI no longer reaches into `nesting/` directly. S2 swaps the implementation of `IPackingService` from the TS-backed `LegacyPackingService` to a Rust-backed `RustPackingService` without touching any UI code. The Rust engine is built on `jagua-rs` (MPL-2.0) + `sparrow` (MIT), which provide a peer-reviewed NFP collision-detection engine and an LNS+SA metaheuristic optimizer.

S2 honors the `PackRequest` / `PackResult` / `Placement` contract defined in `src/application/packing/types.ts`. The Rust engine accepts JSON that matches those shapes verbatim (camelCase field names via serde rename).

## 2. Clean Architecture (Rust side)

The Rust crates follow the same layering as the TypeScript codebase:

| TS convention | Rust equivalent |
|---|---|
| `src/entities/` — domain types | `crates/*/src/domain/` — pure types, invariants, no deps beyond stdlib + serde |
| `src/application/` — interfaces + use-cases | `crates/*/src/application/` — orchestration, depends only on `domain` |
| `src/infrastructure/` — vendor adapters | `crates/*/src/infrastructure/` — jagua-rs, sparrow, clipper2 wrappers |
| `app/` — delivery (Next.js) | `crates/pack-cli/` — stdin/stdout delivery |

**Dependency rules (enforced by module layout and code review):**

- `domain` modules depend on nothing except `std` + `serde`
- `application` modules depend on `domain` only (no vendor types in signatures)
- `infrastructure` modules depend on `domain` + `application` + vendor crates
- `pack-cli` depends on `application` entry points only, never on `infrastructure` directly

This keeps jagua-rs and sparrow types sealed inside `infrastructure/`. The public surface of `rf-layout::application::pack` accepts `domain::PackRequest` and returns `domain::PackResult` — nothing else.

## 3. Cargo workspace layout

```
rema-portal/
└── engine/
    ├── Cargo.toml                   # workspace root
    ├── rust-toolchain.toml          # stable 1.93
    ├── .gitignore                   # target/
    ├── README.md
    ├── crates/
    │   ├── rf-geom/               # future OSS (MIT)
    │   │   ├── Cargo.toml
    │   │   ├── README.md
    │   │   ├── src/
    │   │   │   ├── lib.rs           # re-exports application surface
    │   │   │   ├── domain/
    │   │   │   │   ├── mod.rs
    │   │   │   │   ├── point.rs     # Point2D
    │   │   │   │   ├── polygon.rs   # Polygon + invariants
    │   │   │   │   ├── rect.rs
    │   │   │   │   └── errors.rs
    │   │   │   ├── application/
    │   │   │   │   ├── mod.rs
    │   │   │   │   ├── normalize.rs # CCW + origin normalization
    │   │   │   │   ├── convex_hull.rs # Andrew's monotone chain
    │   │   │   │   ├── sat.rs       # Separating Axis Theorem overlap
    │   │   │   │   └── inscribed.rs # maximal inscribed rectangles
    │   │   │   └── infrastructure/
    │   │   │       ├── mod.rs
    │   │   │       └── clipper.rs   # clipper2 wrapper (union/diff/offset)
    │   │   └── tests/
    │   ├── rf-layout/             # future OSS (MIT)
    │   │   ├── Cargo.toml
    │   │   ├── README.md
    │   │   ├── src/
    │   │   │   ├── lib.rs
    │   │   │   ├── domain/
    │   │   │   │   ├── mod.rs
    │   │   │   │   ├── request.rs   # PackRequest, Bin, Part, ShapeSpec
    │   │   │   │   ├── result.rs    # PackResult, Placement, BinResult
    │   │   │   │   └── errors.rs    # PackError
    │   │   │   ├── application/
    │   │   │   │   ├── mod.rs
    │   │   │   │   └── pack.rs      # pub fn pack(req) -> Result<PackResult>
    │   │   │   └── infrastructure/
    │   │   │       ├── mod.rs
    │   │   │       ├── jagua_adapter.rs   # domain ↔ jagua-rs primitives
    │   │   │       ├── sparrow_driver.rs  # LNS+SA time-budget driver
    │   │   │       └── warm_start.rs      # greedy bottom-left seed
    │   │   └── tests/
    │   │       └── parity.rs        # runs against the 9 fixtures
    │   └── pack-cli/                # stays private
    │       ├── Cargo.toml
    │       ├── README.md
    │       └── src/main.rs          # stdin JSON → pack() → stdout JSON
```

## 4. Canonical types (Rust mirror of S1's TS)

Each `domain` type serde-serializes with camelCase to match the TS contract. Fields preserved exactly.

```rust
// rf-geom/src/domain/point.rs
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Point2D { pub x: f64, pub y: f64 }

// rf-layout/src/domain/request.rs
#[serde(rename_all = "camelCase")]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ShapeSpec {
    pub kind: String,
    pub params: HashMap<String, Value>,
}

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Part {
    pub shape_id: String,
    pub quantity: u32,
    pub polygon: Vec<Point2D>,
    pub shape_spec: Option<ShapeSpec>,
    pub allow_rotation: bool,
    pub grain_axis: Option<GrainAxis>,
    pub difficulty: Option<f64>,
}

#[serde(rename_all = "camelCase")]
pub struct Bin { /* bin_id, width, height, kind, priority */ }

#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    pub bins: Vec<Bin>,
    pub clearance: f64,
    pub items: Vec<Part>,
    pub operator_profile: Option<OperatorProfile>,
    pub mode: Option<PackMode>,
    pub time_budget_ms: Option<u64>,
    pub improvement_budget_ms: Option<u64>,
    pub seed: Option<u64>,
}

// rf-layout/src/domain/result.rs
pub struct PackResult {
    pub placements: Vec<Placement>,
    pub placed_count: u32,
    pub overflow_count: u32,
    pub per_bin: Vec<BinResult>,
    pub total_used_area: f64,
    pub total_waste_area: f64,
}

pub struct Placement {
    pub shape_id: String,
    pub instance_index: u32,
    pub bin_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation_rad: f64,
    pub polygon: Vec<Point2D>,
    pub width: f64,
    pub height: f64,
    pub difficulty: Option<f64>,
}
```

### Invariants (enforced in `domain/*` constructors / validators)

- `Polygon::new(pts)` validates: CCW winding, min-corner at (0, 0), ≥3 vertices
- `Part` `quantity >= 1`, `polygon.len() >= 3`
- `Bin` `width > 0 && height > 0`
- `PackRequest` `bins.len() >= 1 && items.len() >= 1`
- `Placement.polygon` always populated (never empty)
- `BinResult.efficiency` in `[0.0, 1.0]`

## 5. Public `pack` entry (application layer)

```rust
// rf-layout/src/application/pack.rs
use crate::domain::{PackRequest, PackResult, PackError};
use crate::infrastructure::{jagua_adapter, sparrow_driver, warm_start};

pub fn pack(request: PackRequest) -> Result<PackResult, PackError> {
    let mut remaining = request.items.clone();
    let mut per_bin = Vec::new();
    let mut placements = Vec::new();

    // Honor mode → time_budget_ms conversion (same as TS: fast=2s, balanced=10s, thorough=30s)
    let budget_ms = request.resolved_time_budget_ms();

    for bin in &request.bins {
        if remaining.iter().all(|r| r.quantity == 0) { break; }

        // 1. Warm start: greedy bottom-left placement
        let seed = warm_start::greedy_bottom_left(bin, &remaining, request.clearance)?;

        // 2. Metaheuristic search within bin's share of the time budget
        let per_bin_budget_ms = budget_ms / (request.bins.len() as u64);
        let layout = sparrow_driver::optimize(seed, per_bin_budget_ms, request.seed)?;

        // 3. Extract placements + update remaining quantities
        jagua_adapter::extract_placements(&layout, bin, &mut placements, &mut remaining);
        per_bin.push(jagua_adapter::bin_result(bin, &layout));
    }

    PackResult::assemble(placements, per_bin, &request.items, &remaining)
}
```

The signature is pure — no vendor types. Callers never see jagua-rs or sparrow.

## 6. Delivery: `pack-cli`

```rust
// pack-cli/src/main.rs
use std::io::{self, Read, Write};
use rf_layout::application::pack;
use rf_layout::domain::PackRequest;

fn main() -> std::process::ExitCode {
    let mut input = String::new();
    if io::stdin().read_to_string(&mut input).is_err() {
        eprintln!("pack-cli: failed to read stdin");
        return std::process::ExitCode::FAILURE;
    }
    let request: PackRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("pack-cli: invalid JSON request: {e}");
            return std::process::ExitCode::FAILURE;
        }
    };
    match pack(request) {
        Ok(result) => {
            let out = serde_json::to_string(&result).expect("result serializes");
            io::stdout().write_all(out.as_bytes()).ok();
            std::process::ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("pack-cli: pack failed: {e}");
            std::process::ExitCode::FAILURE
        }
    }
}
```

- Single-shot: one invocation per pack call
- No job IDs, no cancellation (cancel = SIGTERM → short-circuit)
- stdout is JSON-only on success; stderr carries human messages

## 7. TS adapter: `RustPackingService`

New file `src/infrastructure/services/rustPackingService.ts` implementing `IPackingService`:

```typescript
import { spawn } from "node:child_process"
import "reflect-metadata"
import { injectable } from "tsyringe"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest, PackResult, PackProgress } from "@/src/application/packing/types"
import path from "node:path"

const BINARY_PATH = path.resolve(process.cwd(), "engine/target/release/pack-cli")

@injectable()
export class RustPackingService implements IPackingService {
  async pack(
    request: PackRequest,
    onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(BINARY_PATH, [], { stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (c) => { stdout += c.toString() })
      child.stderr.on("data", (c) => { stderr += c.toString() })
      child.on("error", reject)
      child.on("close", (code) => {
        if (code === 0) {
          try { resolve(JSON.parse(stdout) as PackResult) }
          catch (e) { reject(new Error(`pack-cli stdout parse error: ${(e as Error).message}`)) }
        } else {
          reject(new Error(`pack-cli exited ${code}: ${stderr.trim()}`))
        }
      })
      child.stdin.write(JSON.stringify(request))
      child.stdin.end()
    })
  }

  async cancel(_jobId: string): Promise<void> {
    // S2: no cancellation surface; pack-cli is single-shot.
    // S4 Tauri migration adds per-job abort handles.
  }
}
```

### DI swap

In `di/di-registration.ts`, change:
```typescript
container.registerSingleton(TOKENS.IPackingService, LegacyPackingService)
```
to:
```typescript
const useRust = process.env.USE_RUST_ENGINE !== "false" && fs.existsSync(BINARY_PATH)
container.registerSingleton(
  TOKENS.IPackingService,
  useRust ? RustPackingService : LegacyPackingService
)
```

The env-flag fallback keeps `LegacyPackingService` as a safety net for the first week after rollout. Missing binary (e.g., developer forgot `npm run build:engine`) also falls back.

## 8. Parity strategy

The Rust engine will find **different** layouts than the legacy TS engine — likely **better**, since sparrow's LNS+SA outperforms the vendored GA.

**Snapshot tests must allow improvement while catching regression.**

Update `tests/packing/parity/parity.test.ts`:
- Separate `legacy_baseline.snap` (locks the behavior of `LegacyPackingService` — unchanged)
- New `rust_baseline.snap` (locks the behavior of `RustPackingService`)
- Both run; each asserts against its own baseline
- Additional cross-engine assertion: `rust.placedCount >= legacy.placedCount`, `rust.overflowCount <= legacy.overflowCount`, `rust.per_bin[i].efficiency >= legacy.per_bin[i].efficiency - 0.005`

This locks Rust's behavior deterministically (seeded), prevents regression below Rust's own baseline, AND prevents Rust from accidentally being worse than the legacy baseline.

## 9. Build + CI

`package.json` scripts:
```json
{
  "scripts": {
    "build:engine": "cargo build --release --manifest-path engine/Cargo.toml",
    "build:engine:dev": "cargo build --manifest-path engine/Cargo.toml",
    "prebuild": "npm run build:engine",
    "pretest": "npm run build:engine:dev",
    "test:rust": "cargo test --manifest-path engine/Cargo.toml"
  }
}
```

- `npm run build` triggers Rust release build automatically
- `npm run test` triggers Rust dev build so the `pack-cli` binary exists for E2E tests
- `npm run test:rust` runs Cargo tests only (for Rust-only CI pipelines)

`.gitignore` addition: `engine/target/`

CI pipeline:
1. `cargo test --manifest-path engine/Cargo.toml`
2. `cargo build --release --manifest-path engine/Cargo.toml`
3. `npm run typecheck && npm run lint`
4. `npm run test` (which depends on the built binary for E2E fixtures)

## 10. Test strategy

**Rust unit tests (per crate):**
- `rf-geom`: every `domain` constructor invariant, every `application` operation round-trip, clipper wrappers against hand-computed golden values
- `rf-layout`: `domain::PackRequest` deserialization from TS JSON, `application::pack` against the 9 fixtures with tolerance assertions

**TS integration tests:**
- `tests/packing/rust-e2e.test.ts` — spawns `pack-cli`, feeds fixture JSON, asserts parity tolerances
- The existing `LegacyPackingService` integration tests remain (legacy still shipped behind the flag)

**Benchmarks:** one smoke benchmark in `tests/packing/rust-perf.test.ts` that runs each of the 9 fixtures under `mode: "fast"` and asserts wall-clock < 3 seconds per run. Not a true perf suite; just a regression guard.

## 11. Out of scope

- Tauri integration — S4
- Public GitHub repo for rf-layout/rf-geom — deferred until after S4 ships
- `rema-reorder` extraction — independent of the engine
- `operatorProfile` scoring — accepted but ignored by engine in S2; UI wiring in S5
- Streaming per-generation progress events — S4 adds via Tauri events
- WebAssembly build — subprocess is sufficient through S4
- Cross-platform signing / installer — S4

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| jagua-rs API or sparrow API changes mid-project | Pin exact versions in `Cargo.toml`; `cargo vendor` if stability demands |
| serde field mapping drift between TS types.ts and Rust domain | Dedicated tests in `rf-layout/tests/` that deserialize a snapshot of every fixture JSON and assert round-trip |
| Clipper2 Rust bindings unstable / unmaintained | Start with `clipper2` crate; fallback to pure-Rust ports (`geo_clipper`, `i_overlay`). Polygon difference + offset are the only hot paths. |
| Parity tolerance too loose → Rust quietly regresses | Independent `rust_baseline.snap` locks Rust's own output byte-for-byte; only cross-engine comparison is tolerance-based |
| Developer without Rust installed blows up `npm run build` | `prebuild` script checks `command -v cargo` first; fails with "Install Rust toolchain" message if absent |
| `pack-cli` binary missing at runtime | `RustPackingService` existence check in DI registration falls back to `LegacyPackingService` with a console warning |

## 13. Handoff to S3 + S4

After S2:
- `engine/` Cargo workspace is the single source of Rust code
- `IPackingService` resolves to `RustPackingService` by default; `LegacyPackingService` is opt-in fallback
- The 9 parity fixtures have two baselines (legacy + rust) and assert tolerance vs each other

S3 (Rust backend + Supabase):
- Adds a new workspace member `crates/rema-backend/` that depends on `rf-layout::application`
- Reuses the same Cargo workspace, tooling, CI surface

S4 (Tauri):
- Replaces `child_process.spawn` in `RustPackingService` with Tauri command invocation
- `pack-cli` binary retired; `rf-layout::application::pack` becomes a Tauri command handler directly
- Adds per-job cancellation via `tauri::State` with abort handles

## 14. References

- jagua-rs — https://github.com/JeroenGar/jagua-rs (MPL-2.0) — peer-reviewed collision engine
- sparrow — https://github.com/JeroenGar/sparrow (MIT) — LNS+SA optimizer
- clipper2 — https://www.angusj.com/clipper2 (Boost license) — polygon boolean ops; Rust bindings via `clipper2` crate
- Migration overview: `./2026-04-17-migration-overview-design.md`
- S1 spec: `./2026-04-17-s1-canonical-pipeline-design.md`
- S1 plan: `../plans/2026-04-17-s1-canonical-pipeline.md`
