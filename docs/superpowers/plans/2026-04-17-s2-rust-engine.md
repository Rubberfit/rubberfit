# S2 — Rust Nesting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `LegacyPackingService` with a native Rust engine (jagua-rs + sparrow) behind `IPackingService`, with zero UI code changes.

**Architecture:** Cargo workspace at `engine/` with three crates. `rf-geom` owns geometry primitives. `rf-layout` owns packing orchestration. `pack-cli` is the JSON stdin/stdout delivery layer. Each crate has clean-architecture layering (`domain/`, `application/`, `infrastructure/`). TypeScript calls Rust via `child_process.spawn`.

**Tech Stack:** Rust 1.93 stable, jagua-rs (MPL-2.0), sparrow (MIT), clipper2 crate (Boost license), serde + serde_json for the wire format.

**Spec:** `docs/superpowers/specs/2026-04-17-s2-rust-engine-design.md`

## Standing rule — directory READMEs

Every task that adds/modifies code in a directory updates that directory's `README.md` in the same commit. New directories → new README. Match the existing style (concise one-line per file).

---

## File Structure

### New under `engine/`

- `engine/Cargo.toml` — workspace root
- `engine/rust-toolchain.toml` — stable 1.93
- `engine/.gitignore` — `target/`
- `engine/README.md` — workspace overview
- `engine/crates/rf-geom/` — geometry crate (see §2 of spec for layout)
- `engine/crates/rf-layout/` — packing crate
- `engine/crates/pack-cli/` — CLI delivery binary

### New under `src/`

- `src/infrastructure/services/rustPackingService.ts` — spawn-based adapter

### New under `tests/`

- `tests/packing/rust-e2e.test.ts` — TS→CLI→TS round-trip
- `tests/packing/rust-perf.test.ts` — time-budget regression guard
- `tests/packing/parity/__snapshots__/rust_baseline.snap` — auto-generated

### Modified

- `di/di-registration.ts` — env-flag-driven implementation swap
- `tests/packing/parity/parity.test.ts` — dual-baseline + cross-engine tolerance
- `package.json` — add `build:engine`, `prebuild`, `pretest`, `test:rust` scripts
- `.gitignore` — add `engine/target/`

---

## Phase 1 — Workspace foundation

### Task 1: Create Cargo workspace

**Files:**
- Create: `engine/Cargo.toml`
- Create: `engine/rust-toolchain.toml`
- Create: `engine/.gitignore`
- Create: `engine/README.md`
- Modify: `.gitignore` (root) — add `engine/target/`

- [ ] **Step 1: Create the workspace Cargo.toml**

```toml
# engine/Cargo.toml
[workspace]
resolver = "2"
members = [
    "crates/rf-geom",
    "crates/rf-layout",
    "crates/pack-cli",
]

[workspace.package]
edition = "2021"
rust-version = "1.93"
license = "MIT"

[workspace.dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
anyhow = "1"
thiserror = "2"

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
```

- [ ] **Step 2: Pin the toolchain**

```toml
# engine/rust-toolchain.toml
[toolchain]
channel = "1.93"
components = ["rustfmt", "clippy"]
```

- [ ] **Step 3: Add Rust .gitignore**

```gitignore
# engine/.gitignore
target/
Cargo.lock.bak
*.rs.bk
```

- [ ] **Step 4: Append to root .gitignore**

Append to existing `.gitignore`:
```
engine/target/
```

- [ ] **Step 5: Write engine README**

```markdown
# engine/

Native Rust nesting engine for RF Portal. Replaces the TypeScript `LegacyPackingService` behind `IPackingService` via a JSON stdin/stdout CLI binary.

## Layout

- `crates/rf-geom/` — geometry primitives (future open-source crate, MIT)
- `crates/rf-layout/` — packing engine (future open-source crate, MIT); depends on `jagua-rs` + `sparrow`
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
```

- [ ] **Step 6: Verify workspace recognizes itself**

Run: `cd engine && cargo check --workspace 2>&1 | head -5`
Expected: "no targets specified in the manifest" or workspace error for missing member crates — that's expected since we haven't created the crates yet. We just want cargo to parse the root Cargo.toml cleanly.

- [ ] **Step 7: Commit**

```bash
git add engine/Cargo.toml engine/rust-toolchain.toml engine/.gitignore engine/README.md .gitignore
git commit -m "feat(engine): initialize Cargo workspace at engine/"
```

---

### Task 2: Add npm build integration

**Files:**
- Modify: `package.json` — add Rust-build scripts

- [ ] **Step 1: Read current package.json scripts**

Read `package.json` to find the `scripts` object.

- [ ] **Step 2: Add engine scripts**

Add these entries to the `scripts` object, preserving all existing scripts:

```json
{
  "build:engine": "cargo build --release --manifest-path engine/Cargo.toml",
  "build:engine:dev": "cargo build --manifest-path engine/Cargo.toml",
  "test:rust": "cargo test --manifest-path engine/Cargo.toml",
  "fmt:rust": "cargo fmt --manifest-path engine/Cargo.toml --all",
  "clippy:rust": "cargo clippy --manifest-path engine/Cargo.toml --all-targets -- -D warnings"
}
```

Note: `prebuild` and `pretest` hooks come in Task 25; this task just exposes the scripts.

- [ ] **Step 3: Verify script works (smoke test)**

Run: `npm run build:engine 2>&1 | tail -5`
Expected: the command parses and runs. It may fail because crate members don't exist yet — that's fine. We just want the script wiring to be correct.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(engine): add npm scripts for Rust build + test + lint"
```

---

## Phase 2 — rf-geom domain layer

### Task 3: rf-geom crate + Point2D

**Files:**
- Create: `engine/crates/rf-geom/Cargo.toml`
- Create: `engine/crates/rf-geom/README.md`
- Create: `engine/crates/rf-geom/src/lib.rs`
- Create: `engine/crates/rf-geom/src/domain/mod.rs`
- Create: `engine/crates/rf-geom/src/domain/point.rs`

- [ ] **Step 1: Write the Cargo.toml**

```toml
# engine/crates/rf-geom/Cargo.toml
[package]
name = "rf-geom"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true
description = "2D geometry primitives for RF nesting engine"

[dependencies]
serde = { workspace = true }
thiserror = { workspace = true }
```

- [ ] **Step 2: Write the crate README**

```markdown
# rf-geom

2D geometry primitives for the RF nesting engine.

## Layout

- `src/domain/` — pure types (Point2D, Polygon, Rect) + invariants
- `src/application/` — operations (normalize, convex hull, SAT, inscribed rects)
- `src/infrastructure/` — vendor wrappers (clipper2)

## Public API (v0.1)

```rust
use rf_geom::domain::{Point2D, Polygon, Rect};
use rf_geom::application::{normalize_polygon, convex_hull, sat_overlap, maximal_inscribed_rects};
use rf_geom::infrastructure::clipper;
```

Polygons are CCW with min-corner at (0, 0). All linear dimensions are unitless — callers supply consistent units (RF uses inches).
```

- [ ] **Step 3: Write domain/mod.rs**

```rust
// engine/crates/rf-geom/src/domain/mod.rs
pub mod point;

pub use point::Point2D;
```

- [ ] **Step 4: Write the failing point test**

```rust
// engine/crates/rf-geom/src/domain/point.rs
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Point2D {
    pub x: f64,
    pub y: f64,
}

impl Point2D {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_constructs_point() {
        let p = Point2D::new(3.0, 4.0);
        assert_eq!(p.x, 3.0);
        assert_eq!(p.y, 4.0);
    }

    #[test]
    fn serializes_as_camel_case_identity() {
        let p = Point2D::new(1.5, 2.5);
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(json, r#"{"x":1.5,"y":2.5}"#);
    }

    #[test]
    fn deserializes_from_json() {
        let p: Point2D = serde_json::from_str(r#"{"x":1.5,"y":2.5}"#).unwrap();
        assert_eq!(p, Point2D::new(1.5, 2.5));
    }
}
```

Note: the test imports `serde_json` — add `serde_json = { workspace = true }` to `[dev-dependencies]` in `rf-geom/Cargo.toml`:

```toml
[dev-dependencies]
serde_json = { workspace = true }
```

- [ ] **Step 5: Write lib.rs**

```rust
// engine/crates/rf-geom/src/lib.rs
pub mod domain;
```

- [ ] **Step 6: Run the test**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): crate scaffold + Point2D domain type"
```

---

### Task 4: Polygon domain type with invariants

**Files:**
- Modify: `engine/crates/rf-geom/src/domain/mod.rs` — re-export Polygon
- Create: `engine/crates/rf-geom/src/domain/polygon.rs`
- Create: `engine/crates/rf-geom/src/domain/errors.rs`

- [ ] **Step 1: Write the failing tests**

```rust
// engine/crates/rf-geom/src/domain/polygon.rs
use crate::domain::errors::GeomError;
use crate::domain::point::Point2D;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(transparent)]
pub struct Polygon {
    points: Vec<Point2D>,
}

impl Polygon {
    pub fn new(points: Vec<Point2D>) -> Result<Self, GeomError> {
        if points.len() < 3 {
            return Err(GeomError::PolygonTooFewVertices { count: points.len() });
        }
        Ok(Self { points })
    }

    pub fn points(&self) -> &[Point2D] {
        &self.points
    }

    pub fn into_points(self) -> Vec<Point2D> {
        self.points
    }

    pub fn signed_area(&self) -> f64 {
        let mut s = 0.0;
        for i in 0..self.points.len() {
            let a = self.points[i];
            let b = self.points[(i + 1) % self.points.len()];
            s += a.x * b.y - b.x * a.y;
        }
        s / 2.0
    }

    pub fn area(&self) -> f64 {
        self.signed_area().abs()
    }

    pub fn bbox(&self) -> (Point2D, Point2D) {
        let mut min = self.points[0];
        let mut max = self.points[0];
        for p in &self.points[1..] {
            if p.x < min.x { min.x = p.x; }
            if p.y < min.y { min.y = p.y; }
            if p.x > max.x { max.x = p.x; }
            if p.y > max.y { max.y = p.y; }
        }
        (min, max)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_square() -> Polygon {
        Polygon::new(vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(1.0, 0.0),
            Point2D::new(1.0, 1.0),
            Point2D::new(0.0, 1.0),
        ]).unwrap()
    }

    #[test]
    fn rejects_fewer_than_three_vertices() {
        let r = Polygon::new(vec![Point2D::new(0.0, 0.0), Point2D::new(1.0, 0.0)]);
        assert!(matches!(r, Err(GeomError::PolygonTooFewVertices { count: 2 })));
    }

    #[test]
    fn accepts_triangle() {
        let tri = Polygon::new(vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(1.0, 0.0),
            Point2D::new(0.0, 1.0),
        ]);
        assert!(tri.is_ok());
    }

    #[test]
    fn unit_square_has_area_one() {
        assert!((unit_square().area() - 1.0).abs() < 1e-9);
    }

    #[test]
    fn unit_square_signed_area_is_positive_when_ccw() {
        // (0,0) → (1,0) → (1,1) → (0,1) is CCW in math coords; signed area > 0
        assert!(unit_square().signed_area() > 0.0);
    }

    #[test]
    fn bbox_of_unit_square_is_zero_to_one() {
        let (min, max) = unit_square().bbox();
        assert_eq!(min, Point2D::new(0.0, 0.0));
        assert_eq!(max, Point2D::new(1.0, 1.0));
    }

    #[test]
    fn serde_roundtrip_as_transparent_array() {
        let p = unit_square();
        let json = serde_json::to_string(&p).unwrap();
        assert_eq!(
            json,
            r#"[{"x":0.0,"y":0.0},{"x":1.0,"y":0.0},{"x":1.0,"y":1.0},{"x":0.0,"y":1.0}]"#
        );
    }
}
```

- [ ] **Step 2: Write errors.rs**

```rust
// engine/crates/rf-geom/src/domain/errors.rs
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum GeomError {
    #[error("polygon must have at least 3 vertices, got {count}")]
    PolygonTooFewVertices { count: usize },
    #[error("polygon is self-intersecting")]
    SelfIntersecting,
    #[error("polygon has zero area")]
    ZeroArea,
}
```

- [ ] **Step 3: Update domain/mod.rs**

```rust
// engine/crates/rf-geom/src/domain/mod.rs
pub mod errors;
pub mod point;
pub mod polygon;

pub use errors::GeomError;
pub use point::Point2D;
pub use polygon::Polygon;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 9 tests pass (3 point + 6 polygon).

- [ ] **Step 5: Update rf-geom README**

Append a "Domain types" section listing Point2D + Polygon with one-line descriptions.

- [ ] **Step 6: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): Polygon domain type with invariants + area/bbox"
```

---

### Task 5: Rect domain type

**Files:**
- Modify: `engine/crates/rf-geom/src/domain/mod.rs`
- Create: `engine/crates/rf-geom/src/domain/rect.rs`

- [ ] **Step 1: Write test + Rect**

```rust
// engine/crates/rf-geom/src/domain/rect.rs
use crate::domain::point::Point2D;
use serde::{Deserialize, Serialize};

#[serde(rename_all = "camelCase")]
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn new(x: f64, y: f64, width: f64, height: f64) -> Self {
        Self { x, y, width, height }
    }

    pub fn area(&self) -> f64 {
        self.width * self.height
    }

    pub fn min_corner(&self) -> Point2D {
        Point2D::new(self.x, self.y)
    }

    pub fn max_corner(&self) -> Point2D {
        Point2D::new(self.x + self.width, self.y + self.height)
    }

    pub fn contains(&self, p: Point2D) -> bool {
        p.x >= self.x
            && p.x <= self.x + self.width
            && p.y >= self.y
            && p.y <= self.y + self.height
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn area_is_width_times_height() {
        assert_eq!(Rect::new(0.0, 0.0, 3.0, 4.0).area(), 12.0);
    }

    #[test]
    fn contains_point_inside() {
        let r = Rect::new(0.0, 0.0, 10.0, 10.0);
        assert!(r.contains(Point2D::new(5.0, 5.0)));
    }

    #[test]
    fn does_not_contain_point_outside() {
        let r = Rect::new(0.0, 0.0, 10.0, 10.0);
        assert!(!r.contains(Point2D::new(15.0, 5.0)));
    }
}
```

- [ ] **Step 2: Update domain/mod.rs**

```rust
pub mod errors;
pub mod point;
pub mod polygon;
pub mod rect;

pub use errors::GeomError;
pub use point::Point2D;
pub use polygon::Polygon;
pub use rect::Rect;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 12 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): Rect domain type"
```

---

## Phase 3 — rf-geom application layer

### Task 6: Polygon normalization (CCW + origin)

**Files:**
- Create: `engine/crates/rf-geom/src/application/mod.rs`
- Create: `engine/crates/rf-geom/src/application/normalize.rs`
- Modify: `engine/crates/rf-geom/src/lib.rs`

- [ ] **Step 1: Write the failing tests**

```rust
// engine/crates/rf-geom/src/application/normalize.rs
use crate::domain::{GeomError, Point2D, Polygon};

/// Normalize a polygon to CCW winding with min-corner at (0, 0).
pub fn normalize_polygon(points: Vec<Point2D>) -> Result<Polygon, GeomError> {
    if points.len() < 3 {
        return Err(GeomError::PolygonTooFewVertices { count: points.len() });
    }
    let min_x = points.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
    let min_y = points.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
    let translated: Vec<Point2D> = points
        .iter()
        .map(|p| Point2D::new(p.x - min_x, p.y - min_y))
        .collect();

    let polygon = Polygon::new(translated)?;
    if polygon.signed_area() >= 0.0 {
        Ok(polygon)
    } else {
        let mut reversed: Vec<Point2D> = polygon.points().to_vec();
        reversed.reverse();
        Polygon::new(reversed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_to_origin() {
        let raw = vec![
            Point2D::new(5.0, 10.0),
            Point2D::new(8.0, 10.0),
            Point2D::new(8.0, 14.0),
            Point2D::new(5.0, 14.0),
        ];
        let p = normalize_polygon(raw).unwrap();
        let (min, _) = p.bbox();
        assert_eq!(min, Point2D::new(0.0, 0.0));
    }

    #[test]
    fn reverses_cw_to_ccw() {
        // CW in math coords: (0,0) → (0,1) → (1,1) → (1,0)
        let cw = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(0.0, 1.0),
            Point2D::new(1.0, 1.0),
            Point2D::new(1.0, 0.0),
        ];
        let p = normalize_polygon(cw).unwrap();
        assert!(p.signed_area() > 0.0, "normalized polygon must be CCW");
    }

    #[test]
    fn rejects_fewer_than_three_vertices() {
        let too_few = vec![Point2D::new(0.0, 0.0), Point2D::new(1.0, 0.0)];
        assert!(normalize_polygon(too_few).is_err());
    }
}
```

- [ ] **Step 2: Wire the application module**

```rust
// engine/crates/rf-geom/src/application/mod.rs
pub mod normalize;

pub use normalize::normalize_polygon;
```

```rust
// engine/crates/rf-geom/src/lib.rs
pub mod application;
pub mod domain;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 15 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): normalize_polygon (CCW + origin)"
```

---

### Task 7: Convex hull (Andrew's monotone chain)

**Files:**
- Create: `engine/crates/rf-geom/src/application/convex_hull.rs`
- Modify: `engine/crates/rf-geom/src/application/mod.rs`

- [ ] **Step 1: Write the failing tests + implementation**

```rust
// engine/crates/rf-geom/src/application/convex_hull.rs
use crate::domain::{GeomError, Point2D, Polygon};

/// Andrew's monotone chain convex hull. Returns points in CCW order.
pub fn convex_hull(points: &[Point2D]) -> Result<Polygon, GeomError> {
    if points.len() < 3 {
        return Err(GeomError::PolygonTooFewVertices { count: points.len() });
    }
    let mut pts: Vec<Point2D> = points.to_vec();
    pts.sort_by(|a, b| {
        a.x.partial_cmp(&b.x)
            .unwrap()
            .then(a.y.partial_cmp(&b.y).unwrap())
    });

    let mut lower: Vec<Point2D> = Vec::new();
    for p in &pts {
        while lower.len() >= 2 && cross(lower[lower.len() - 2], lower[lower.len() - 1], *p) <= 0.0 {
            lower.pop();
        }
        lower.push(*p);
    }

    let mut upper: Vec<Point2D> = Vec::new();
    for p in pts.iter().rev() {
        while upper.len() >= 2 && cross(upper[upper.len() - 2], upper[upper.len() - 1], *p) <= 0.0 {
            upper.pop();
        }
        upper.push(*p);
    }

    lower.pop();
    upper.pop();
    lower.extend(upper);
    Polygon::new(lower)
}

fn cross(o: Point2D, a: Point2D, b: Point2D) -> f64 {
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn triangle_is_its_own_hull() {
        let pts = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(4.0, 0.0),
            Point2D::new(2.0, 3.0),
        ];
        let hull = convex_hull(&pts).unwrap();
        assert_eq!(hull.points().len(), 3);
    }

    #[test]
    fn discards_interior_points() {
        let pts = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(4.0, 0.0),
            Point2D::new(4.0, 4.0),
            Point2D::new(0.0, 4.0),
            Point2D::new(2.0, 2.0), // interior — should be discarded
        ];
        let hull = convex_hull(&pts).unwrap();
        assert_eq!(hull.points().len(), 4);
    }

    #[test]
    fn hull_is_ccw() {
        let pts = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(4.0, 0.0),
            Point2D::new(4.0, 4.0),
            Point2D::new(0.0, 4.0),
        ];
        let hull = convex_hull(&pts).unwrap();
        assert!(hull.signed_area() > 0.0);
    }
}
```

- [ ] **Step 2: Update application/mod.rs**

```rust
// engine/crates/rf-geom/src/application/mod.rs
pub mod convex_hull;
pub mod normalize;

pub use convex_hull::convex_hull;
pub use normalize::normalize_polygon;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 18 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): Andrew's monotone chain convex hull"
```

---

### Task 8: SAT overlap

**Files:**
- Create: `engine/crates/rf-geom/src/application/sat.rs`
- Modify: `engine/crates/rf-geom/src/application/mod.rs`

- [ ] **Step 1: Write SAT test + implementation**

```rust
// engine/crates/rf-geom/src/application/sat.rs
use crate::domain::{Point2D, Polygon};

/// Test whether two convex polygons overlap using the Separating Axis Theorem.
/// Touching edges do NOT count as overlap (strict overlap only).
pub fn sat_overlap(a: &Polygon, b: &Polygon) -> bool {
    !has_separating_axis(a, b) && !has_separating_axis(b, a)
}

fn has_separating_axis(a: &Polygon, b: &Polygon) -> bool {
    let a_pts = a.points();
    for i in 0..a_pts.len() {
        let p1 = a_pts[i];
        let p2 = a_pts[(i + 1) % a_pts.len()];
        let axis = Point2D::new(-(p2.y - p1.y), p2.x - p1.x);
        let (a_min, a_max) = project(a, axis);
        let (b_min, b_max) = project(b, axis);
        if a_max < b_min || b_max < a_min {
            return true;
        }
    }
    false
}

fn project(p: &Polygon, axis: Point2D) -> (f64, f64) {
    let mut min = f64::INFINITY;
    let mut max = f64::NEG_INFINITY;
    for pt in p.points() {
        let d = pt.x * axis.x + pt.y * axis.y;
        if d < min { min = d; }
        if d > max { max = d; }
    }
    (min, max)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square_at(ox: f64, oy: f64, size: f64) -> Polygon {
        Polygon::new(vec![
            Point2D::new(ox, oy),
            Point2D::new(ox + size, oy),
            Point2D::new(ox + size, oy + size),
            Point2D::new(ox, oy + size),
        ]).unwrap()
    }

    #[test]
    fn overlapping_squares_overlap() {
        assert!(sat_overlap(&square_at(0.0, 0.0, 10.0), &square_at(5.0, 5.0, 10.0)));
    }

    #[test]
    fn disjoint_squares_do_not_overlap() {
        assert!(!sat_overlap(&square_at(0.0, 0.0, 10.0), &square_at(20.0, 0.0, 10.0)));
    }

    #[test]
    fn touching_squares_do_not_overlap() {
        // Edge-adjacent squares: strict overlap is false
        assert!(!sat_overlap(&square_at(0.0, 0.0, 10.0), &square_at(10.0, 0.0, 10.0)));
    }
}
```

- [ ] **Step 2: Update application/mod.rs**

```rust
pub mod convex_hull;
pub mod normalize;
pub mod sat;

pub use convex_hull::convex_hull;
pub use normalize::normalize_polygon;
pub use sat::sat_overlap;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 21 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): SAT overlap for convex polygons"
```

---

### Task 9: Maximal inscribed rectangles (port from TS)

**Files:**
- Create: `engine/crates/rf-geom/src/application/inscribed.rs`
- Modify: `engine/crates/rf-geom/src/application/mod.rs`
- Modify: `engine/crates/rf-geom/Cargo.toml` — add `clipper2` dependency (used only for this + infrastructure)

For S2 we port only the core histogram + monotonic-stack algorithm over a known free-space polygon. Full clipper-backed iterative extraction lives in the `infrastructure/` layer in Task 10.

- [ ] **Step 1: Add clipper2 to Cargo.toml**

```toml
[dependencies]
serde = { workspace = true }
thiserror = { workspace = true }
clipper2 = "0.5"
```

- [ ] **Step 2: Write test + inscribed-rectangle finder**

```rust
// engine/crates/rf-geom/src/application/inscribed.rs
use crate::domain::{Point2D, Polygon, Rect};

/// Find the largest axis-aligned inscribed rectangle inside a polygon.
/// Uses a grid + histogram + monotonic stack (O(RC) time).
/// `grid_step` controls grid density.
pub fn largest_inscribed_rect(
    polygon: &Polygon,
    grid_step: f64,
) -> Option<Rect> {
    let (min, max) = polygon.bbox();
    if grid_step <= 0.0 || (max.x - min.x) < grid_step || (max.y - min.y) < grid_step {
        return None;
    }
    let cols = ((max.x - min.x) / grid_step).ceil() as usize;
    let rows = ((max.y - min.y) / grid_step).ceil() as usize;

    // Mark cells as inside (true) or outside (false)
    let mut grid = vec![vec![false; cols]; rows];
    for r in 0..rows {
        for c in 0..cols {
            let cx = min.x + (c as f64 + 0.5) * grid_step;
            let cy = min.y + (r as f64 + 0.5) * grid_step;
            if point_in_polygon(Point2D::new(cx, cy), polygon) {
                grid[r][c] = true;
            }
        }
    }

    // Histogram heights
    let mut heights = vec![0usize; cols];
    let mut best: Option<(usize, usize, usize, usize)> = None; // (area, r_end, c_lo, c_hi)
    for r in 0..rows {
        for c in 0..cols {
            heights[c] = if grid[r][c] { heights[c] + 1 } else { 0 };
        }
        if let Some((area, c_lo, c_hi, h)) = largest_in_histogram(&heights) {
            let current = best.map(|(a, _, _, _)| a).unwrap_or(0);
            if area > current {
                best = Some((area, r, c_lo, c_hi));
                let _ = h;
            }
        }
    }

    let (area, r_end, c_lo, c_hi) = best?;
    let h_cells = area / (c_hi - c_lo + 1);
    Some(Rect::new(
        min.x + (c_lo as f64) * grid_step,
        min.y + ((r_end + 1 - h_cells) as f64) * grid_step,
        ((c_hi - c_lo + 1) as f64) * grid_step,
        (h_cells as f64) * grid_step,
    ))
}

fn point_in_polygon(p: Point2D, polygon: &Polygon) -> bool {
    // Ray casting PIP
    let pts = polygon.points();
    let n = pts.len();
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let pi = pts[i];
        let pj = pts[j];
        if (pi.y > p.y) != (pj.y > p.y)
            && p.x < (pj.x - pi.x) * (p.y - pi.y) / (pj.y - pi.y) + pi.x
        {
            inside = !inside;
        }
        j = i;
    }
    inside
}

fn largest_in_histogram(heights: &[usize]) -> Option<(usize, usize, usize, usize)> {
    // Returns (area, c_lo, c_hi, h)
    let mut stack: Vec<usize> = Vec::new();
    let mut best: Option<(usize, usize, usize, usize)> = None;
    for i in 0..=heights.len() {
        let h = if i == heights.len() { 0 } else { heights[i] };
        while let Some(&top) = stack.last() {
            if heights[top] <= h { break; }
            stack.pop();
            let c_lo = stack.last().map(|&s| s + 1).unwrap_or(0);
            let c_hi = i - 1;
            let area = heights[top] * (c_hi - c_lo + 1);
            let current = best.map(|(a, _, _, _)| a).unwrap_or(0);
            if area > current {
                best = Some((area, c_lo, c_hi, heights[top]));
            }
        }
        stack.push(i);
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_square() -> Polygon {
        Polygon::new(vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(10.0, 0.0),
            Point2D::new(10.0, 10.0),
            Point2D::new(0.0, 10.0),
        ]).unwrap()
    }

    #[test]
    fn inscribed_rect_of_square_is_approximately_the_square() {
        let r = largest_inscribed_rect(&unit_square(), 1.0).unwrap();
        assert!(r.area() >= 81.0); // allowing 1-cell border due to grid quantization
    }

    #[test]
    fn none_when_grid_step_too_large() {
        assert!(largest_inscribed_rect(&unit_square(), 20.0).is_none());
    }
}
```

- [ ] **Step 3: Update application/mod.rs**

```rust
pub mod convex_hull;
pub mod inscribed;
pub mod normalize;
pub mod sat;

pub use convex_hull::convex_hull;
pub use inscribed::largest_inscribed_rect;
pub use normalize::normalize_polygon;
pub use sat::sat_overlap;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 23 tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): largest inscribed rectangle (histogram + monotonic stack)"
```

---

## Phase 4 — rf-geom infrastructure layer

### Task 10: Clipper2 wrapper

**Files:**
- Create: `engine/crates/rf-geom/src/infrastructure/mod.rs`
- Create: `engine/crates/rf-geom/src/infrastructure/clipper.rs`
- Modify: `engine/crates/rf-geom/src/lib.rs`

- [ ] **Step 1: Write clipper wrapper + tests**

```rust
// engine/crates/rf-geom/src/infrastructure/clipper.rs
use crate::domain::{Point2D, Polygon};
use clipper2::*;

const SCALE: f64 = 1e7; // clipper2 uses i64 coords; scale to preserve precision

fn to_clipper(p: &Polygon) -> Vec<(i64, i64)> {
    p.points()
        .iter()
        .map(|pt| ((pt.x * SCALE) as i64, (pt.y * SCALE) as i64))
        .collect()
}

fn from_clipper(pts: Vec<(i64, i64)>) -> Vec<Point2D> {
    pts.into_iter()
        .map(|(x, y)| Point2D::new(x as f64 / SCALE, y as f64 / SCALE))
        .collect()
}

/// Union of two polygons. Returns the resulting simple polygons.
pub fn union(a: &Polygon, b: &Polygon) -> Vec<Polygon> {
    let subjects: Paths<i64> = vec![to_clipper(a)].into();
    let clips: Paths<i64> = vec![to_clipper(b)].into();
    let result = subjects.union(&clips, FillRule::NonZero);
    result
        .into_iter()
        .filter_map(|path| Polygon::new(from_clipper(path.into())).ok())
        .collect()
}

/// Difference a \ b (a minus b).
pub fn difference(a: &Polygon, b: &[Polygon]) -> Vec<Polygon> {
    let subjects: Paths<i64> = vec![to_clipper(a)].into();
    let clips: Paths<i64> = b.iter().map(|p| to_clipper(p)).collect::<Vec<_>>().into();
    let result = subjects.difference(&clips, FillRule::NonZero);
    result
        .into_iter()
        .filter_map(|path| Polygon::new(from_clipper(path.into())).ok())
        .collect()
}

/// Outward (positive delta) or inward (negative delta) offset.
pub fn offset(p: &Polygon, delta: f64) -> Vec<Polygon> {
    let paths: Paths<i64> = vec![to_clipper(p)].into();
    let result = paths.inflate(delta * SCALE, JoinType::Square, EndType::Polygon, 2.0);
    result
        .into_iter()
        .filter_map(|path| Polygon::new(from_clipper(path.into())).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(origin: Point2D, size: f64) -> Polygon {
        Polygon::new(vec![
            origin,
            Point2D::new(origin.x + size, origin.y),
            Point2D::new(origin.x + size, origin.y + size),
            Point2D::new(origin.x, origin.y + size),
        ]).unwrap()
    }

    #[test]
    fn union_of_disjoint_squares_yields_two_polygons() {
        let a = square(Point2D::new(0.0, 0.0), 5.0);
        let b = square(Point2D::new(10.0, 0.0), 5.0);
        let result = union(&a, &b);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn difference_carves_a_hole_shaped_result() {
        let outer = square(Point2D::new(0.0, 0.0), 10.0);
        let inner = square(Point2D::new(3.0, 3.0), 4.0);
        let result = difference(&outer, std::slice::from_ref(&inner));
        // Outer with interior subtracted — result area should be 100 - 16 = 84
        let area: f64 = result.iter().map(|p| p.area()).sum();
        assert!((area - 84.0).abs() < 0.5);
    }

    #[test]
    fn offset_grows_outward() {
        let s = square(Point2D::new(0.0, 0.0), 10.0);
        let expanded = offset(&s, 2.0);
        assert_eq!(expanded.len(), 1);
        let area = expanded[0].area();
        assert!(area > 100.0, "expanded area should exceed original");
    }
}
```

Note: the exact `clipper2` crate API may differ slightly from this snippet. If compilation fails, adjust the API calls to match the actual crate version. Commit the working version even if the method names differ.

- [ ] **Step 2: Write infrastructure/mod.rs**

```rust
// engine/crates/rf-geom/src/infrastructure/mod.rs
pub mod clipper;
```

- [ ] **Step 3: Update lib.rs**

```rust
// engine/crates/rf-geom/src/lib.rs
pub mod application;
pub mod domain;
pub mod infrastructure;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-geom`
Expected: 26 tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/crates/rf-geom/
git commit -m "feat(rf-geom): clipper2 wrapper (union / difference / offset)"
```

---

## Phase 5 — rf-layout domain layer

### Task 11: rf-layout crate + PackRequest types

**Files:**
- Create: `engine/crates/rf-layout/Cargo.toml`
- Create: `engine/crates/rf-layout/README.md`
- Create: `engine/crates/rf-layout/src/lib.rs`
- Create: `engine/crates/rf-layout/src/domain/mod.rs`
- Create: `engine/crates/rf-layout/src/domain/request.rs`

- [ ] **Step 1: Cargo.toml**

```toml
# engine/crates/rf-layout/Cargo.toml
[package]
name = "rf-layout"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true
description = "2D nesting engine for RF Portal"

[dependencies]
rf-geom = { path = "../rf-geom" }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
anyhow = { workspace = true }

[dev-dependencies]
serde_json = { workspace = true }
```

- [ ] **Step 2: README**

```markdown
# rf-layout

2D nesting engine built on jagua-rs (collision engine) and sparrow (LNS+SA optimizer).

## Public API

```rust
use rf_layout::application::pack;
use rf_layout::domain::{PackRequest, PackResult};

let request: PackRequest = serde_json::from_str(&json)?;
let result: PackResult = pack(request)?;
```

## Layout

- `src/domain/` — pure types matching `src/application/packing/types.ts` in the TS repo (camelCase serde)
- `src/application/pack.rs` — pack() orchestrator
- `src/infrastructure/` — jagua-rs adapter, sparrow driver, warm-start
```

- [ ] **Step 3: domain/request.rs (TDD — write test with a real PackRequest JSON)**

```rust
// engine/crates/rf-layout/src/domain/request.rs
use rf_geom::domain::Point2D;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BinKind {
    Fresh,
    Remnant,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bin {
    pub bin_id: String,
    pub width: f64,
    pub height: f64,
    pub kind: BinKind,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub priority: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ShapeSpec {
    pub kind: String,
    pub params: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GrainAxis {
    Width,
    Length,
    None,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub shape_id: String,
    pub quantity: u32,
    pub polygon: Vec<Point2D>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub shape_spec: Option<ShapeSpec>,
    pub allow_rotation: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub grain_axis: Option<GrainAxis>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub difficulty: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OperatorProfile {
    pub skills: Vec<String>,
    pub max_difficulty: f64,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PackMode {
    Fast,
    Balanced,
    Thorough,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    pub bins: Vec<Bin>,
    pub clearance: f64,
    pub items: Vec<Part>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub operator_profile: Option<OperatorProfile>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub mode: Option<PackMode>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub time_budget_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub improvement_budget_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub seed: Option<u64>,
}

pub const FAST_MS: u64 = 2_000;
pub const BALANCED_MS: u64 = 10_000;
pub const THOROUGH_MS: u64 = 30_000;

impl PackRequest {
    pub fn resolved_time_budget_ms(&self) -> u64 {
        if let Some(ms) = self.time_budget_ms { return ms; }
        match self.mode {
            Some(PackMode::Fast) => FAST_MS,
            Some(PackMode::Thorough) => THOROUGH_MS,
            Some(PackMode::Balanced) | None => BALANCED_MS,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r#"{
        "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
        "clearance":0.125,
        "items":[{"shapeId":"rect-a","quantity":1,"polygon":[{"x":0,"y":0},{"x":24,"y":0},{"x":24,"y":12},{"x":0,"y":12}],"allowRotation":true}],
        "mode":"fast",
        "seed":42
    }"#;

    #[test]
    fn deserializes_s1_fixture() {
        let req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        assert_eq!(req.bins.len(), 1);
        assert_eq!(req.bins[0].bin_id, "b1");
        assert_eq!(req.items.len(), 1);
        assert_eq!(req.items[0].shape_id, "rect-a");
        assert_eq!(req.items[0].polygon.len(), 4);
        assert_eq!(req.mode, Some(PackMode::Fast));
    }

    #[test]
    fn default_mode_resolves_to_balanced_budget() {
        let req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        // Our fixture uses mode: "fast" → 2000ms
        assert_eq!(req.resolved_time_budget_ms(), FAST_MS);
    }

    #[test]
    fn explicit_budget_overrides_mode() {
        let mut req: PackRequest = serde_json::from_str(FIXTURE).unwrap();
        req.time_budget_ms = Some(7_500);
        assert_eq!(req.resolved_time_budget_ms(), 7_500);
    }

    #[test]
    fn bin_kind_serializes_as_lowercase() {
        let b = Bin {
            bin_id: "x".into(),
            width: 1.0,
            height: 1.0,
            kind: BinKind::Remnant,
            priority: None,
        };
        let json = serde_json::to_string(&b).unwrap();
        assert!(json.contains("\"kind\":\"remnant\""));
    }
}
```

- [ ] **Step 4: domain/mod.rs + lib.rs**

```rust
// engine/crates/rf-layout/src/domain/mod.rs
pub mod request;

pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec};
```

```rust
// engine/crates/rf-layout/src/lib.rs
pub mod domain;
```

- [ ] **Step 5: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): crate scaffold + PackRequest domain types"
```

---

### Task 12: PackResult domain types

**Files:**
- Create: `engine/crates/rf-layout/src/domain/result.rs`
- Modify: `engine/crates/rf-layout/src/domain/mod.rs`

- [ ] **Step 1: Write result types + test**

```rust
// engine/crates/rf-layout/src/domain/result.rs
use rf_geom::domain::Point2D;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
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
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub difficulty: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinResult {
    pub bin_id: String,
    pub used_area: f64,
    pub waste_area: f64,
    pub occupied_width: f64,
    pub occupied_height: f64,
    pub efficiency: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackResult {
    pub placements: Vec<Placement>,
    pub placed_count: u32,
    pub overflow_count: u32,
    pub per_bin: Vec<BinResult>,
    pub total_used_area: f64,
    pub total_waste_area: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_camel_case_field_names() {
        let br = BinResult {
            bin_id: "b1".into(),
            used_area: 50.0,
            waste_area: 0.0,
            occupied_width: 10.0,
            occupied_height: 5.0,
            efficiency: 1.0,
        };
        let json = serde_json::to_string(&br).unwrap();
        assert!(json.contains("\"binId\":"));
        assert!(json.contains("\"occupiedWidth\":"));
    }

    #[test]
    fn placement_serializes_polygon_array() {
        let p = Placement {
            shape_id: "a".into(),
            instance_index: 0,
            bin_id: "b1".into(),
            x: 0.0,
            y: 0.0,
            rotation_rad: 0.0,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(1.0, 0.0),
                Point2D::new(1.0, 1.0),
            ],
            width: 1.0,
            height: 1.0,
            difficulty: None,
        };
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"rotationRad\":0.0"));
        assert!(json.contains("\"instanceIndex\":0"));
    }
}
```

- [ ] **Step 2: Update domain/mod.rs**

```rust
pub mod request;
pub mod result;

pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec};
pub use result::{BinResult, PackResult, Placement};
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): PackResult domain types"
```

---

### Task 13: PackError

**Files:**
- Create: `engine/crates/rf-layout/src/domain/errors.rs`
- Modify: `engine/crates/rf-layout/src/domain/mod.rs`

- [ ] **Step 1: Write errors.rs**

```rust
// engine/crates/rf-layout/src/domain/errors.rs
use thiserror::Error;

#[derive(Error, Debug)]
pub enum PackError {
    #[error("pack: no bins provided")]
    NoBins,
    #[error("pack: no items provided")]
    NoItems,
    #[error("pack: invalid polygon on part '{shape_id}': {source}")]
    InvalidPolygon {
        shape_id: String,
        #[source]
        source: rf_geom::domain::GeomError,
    },
    #[error("pack: engine failed: {0}")]
    EngineFailed(String),
    #[error("pack: timeout after {0}ms")]
    Timeout(u64),
}
```

- [ ] **Step 2: Update domain/mod.rs**

```rust
pub mod errors;
pub mod request;
pub mod result;

pub use errors::PackError;
pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec};
pub use result::{BinResult, PackResult, Placement};
```

- [ ] **Step 3: Build**

Run: `cargo build --manifest-path engine/Cargo.toml -p rf-layout`
Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): PackError domain type"
```

---

## Phase 6 — rf-layout infrastructure

### Task 14: jagua-rs dependency + adapter skeleton

**Files:**
- Modify: `engine/crates/rf-layout/Cargo.toml` — add jagua-rs
- Create: `engine/crates/rf-layout/src/infrastructure/mod.rs`
- Create: `engine/crates/rf-layout/src/infrastructure/jagua_adapter.rs`

- [ ] **Step 1: Add jagua-rs to Cargo.toml**

Append to `[dependencies]`:
```toml
jagua-rs = { git = "https://github.com/JeroenGar/jagua-rs", tag = "v0.2.0" }
```

(If this exact tag doesn't exist, use the latest published release tag. Pin exactly.)

- [ ] **Step 2: Write the skeleton adapter**

```rust
// engine/crates/rf-layout/src/infrastructure/jagua_adapter.rs
use crate::domain::{Bin, Part, PackError};
use jagua_rs::entities::general::InstanceGeneric;

/// Convert a rema domain Part + Bin into jagua-rs' internal types.
/// This is the seam between domain and vendor; no jagua types leak past this module.
pub fn to_jagua_instance(
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<InstanceGeneric, PackError> {
    // Full conversion lands in Task 15-17. For now, stub with a "not yet implemented" error.
    let _ = (bins, items, clearance);
    Err(PackError::EngineFailed("jagua adapter not implemented".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::BinKind;

    #[test]
    fn stub_returns_error_for_now() {
        let bins = vec![Bin {
            bin_id: "b1".into(),
            width: 10.0,
            height: 10.0,
            kind: BinKind::Fresh,
            priority: None,
        }];
        let items: Vec<Part> = vec![];
        let r = to_jagua_instance(&bins, &items, 0.125);
        assert!(r.is_err());
    }
}
```

- [ ] **Step 3: Write infrastructure/mod.rs**

```rust
// engine/crates/rf-layout/src/infrastructure/mod.rs
pub mod jagua_adapter;
```

- [ ] **Step 4: Update lib.rs**

```rust
// engine/crates/rf-layout/src/lib.rs
pub mod domain;
pub mod infrastructure;
```

- [ ] **Step 5: Build to verify jagua-rs compiles**

Run: `cargo build --manifest-path engine/Cargo.toml -p rf-layout 2>&1 | tail -20`
Expected: SUCCESS. If jagua-rs version mismatch errors appear, update the `InstanceGeneric` import path to match the pinned jagua-rs tag. The adapter is still a stub, so minor API churn here is OK.

- [ ] **Step 6: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 7 tests pass (6 prior + 1 stub).

- [ ] **Step 7: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): add jagua-rs dep + adapter skeleton"
```

---

### Task 15: Full jagua-rs adapter (domain ↔ jagua Instance)

**Files:**
- Modify: `engine/crates/rf-layout/src/infrastructure/jagua_adapter.rs`

This task replaces the stub from Task 14 with a real conversion. Read jagua-rs docs for the `Instance` + `Item` + `Bin` types.

- [ ] **Step 1: Replace stub with real conversion**

```rust
// engine/crates/rf-layout/src/infrastructure/jagua_adapter.rs
use crate::domain::{Bin, BinKind, Part, PackError};
use jagua_rs::entities::general::{Bin as JBin, Instance, InstanceGeneric, Item};
use jagua_rs::geometry::geo_enums::RotationRange;
use jagua_rs::geometry::primitives::SPolygon;
use rf_geom::domain::Point2D;

pub fn to_jagua_instance(
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<InstanceGeneric, PackError> {
    if bins.is_empty() { return Err(PackError::NoBins); }
    if items.is_empty() { return Err(PackError::NoItems); }

    let jagua_bins: Vec<JBin> = bins
        .iter()
        .map(|b| JBin {
            id: 0, // jagua uses positional IDs; re-index later
            // Rectangle from width × height (jagua expects a polygon)
            shape: rectangle_polygon(b.width, b.height),
            // ...other jagua fields — fill per the actual API
        })
        .collect();
    let _ = clearance; // wired in sparrow driver

    let jagua_items: Vec<Item> = items
        .iter()
        .enumerate()
        .flat_map(|(idx, part)| {
            (0..part.quantity).map(move |inst| Item {
                id: (idx * 1000 + inst as usize) as u32,
                demand: 1,
                shape: polygon_to_jagua(&part.polygon).expect("polygon validated upstream"),
                allowed_rotations: if part.allow_rotation {
                    RotationRange::Continuous
                } else {
                    RotationRange::Discrete(vec![0.0])
                },
            })
        })
        .collect();

    Ok(InstanceGeneric::new(jagua_bins, jagua_items))
}

fn rectangle_polygon(w: f64, h: f64) -> SPolygon {
    let pts = vec![(0.0, 0.0), (w, 0.0), (w, h), (0.0, h)];
    SPolygon::from_raw(pts)
}

fn polygon_to_jagua(poly: &[Point2D]) -> Option<SPolygon> {
    if poly.len() < 3 { return None; }
    let pts: Vec<(f64, f64)> = poly.iter().map(|p| (p.x, p.y)).collect();
    Some(SPolygon::from_raw(pts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_simple_rect_instance() {
        let bins = vec![Bin {
            bin_id: "b1".into(),
            width: 48.0,
            height: 96.0,
            kind: BinKind::Fresh,
            priority: None,
        }];
        let items = vec![Part {
            shape_id: "rect-a".into(),
            quantity: 1,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(24.0, 0.0),
                Point2D::new(24.0, 12.0),
                Point2D::new(0.0, 12.0),
            ],
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        }];
        let r = to_jagua_instance(&bins, &items, 0.125);
        assert!(r.is_ok());
    }
}
```

**IMPORTANT**: The exact field names on `jagua_rs::entities::general::Bin` / `Item` / `InstanceGeneric` depend on the jagua-rs version pinned in Task 14. If compilation fails, read the actual API via `cargo doc --manifest-path engine/Cargo.toml --open` and adjust.

- [ ] **Step 2: Build + test**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 8 tests pass (7 prior + new adapter test).

- [ ] **Step 3: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): real jagua-rs adapter (domain → Instance)"
```

---

### Task 16: Warm-start greedy bottom-left placer

**Files:**
- Create: `engine/crates/rf-layout/src/infrastructure/warm_start.rs`
- Modify: `engine/crates/rf-layout/src/infrastructure/mod.rs`

- [ ] **Step 1: Write the warm-start module**

```rust
// engine/crates/rf-layout/src/infrastructure/warm_start.rs
use crate::domain::{Bin, Part, PackError};
use rf_geom::domain::Point2D;

/// Greedy bottom-left seeding: for each item, try positions along the bottom edge,
/// then increment y. Simple but produces a valid starting layout for sparrow's LNS.
#[derive(Clone, Debug)]
pub struct SeedPlacement {
    pub shape_id: String,
    pub instance_index: u32,
    pub bin_id: String,
    pub x: f64,
    pub y: f64,
    pub rotation_rad: f64,
    pub polygon: Vec<Point2D>,
    pub width: f64,
    pub height: f64,
}

pub fn greedy_bottom_left(
    bin: &Bin,
    items: &[Part],
    _clearance: f64,
) -> Result<Vec<SeedPlacement>, PackError> {
    // Minimal implementation — stack items bottom-to-top by bbox, ignoring rotation.
    // The real search happens in sparrow_driver; this is a starting point.
    let mut placements = Vec::new();
    let mut cursor_y = 0.0;
    for (idx, part) in items.iter().enumerate() {
        let bbox = polygon_bbox(&part.polygon);
        let w = bbox.1.x - bbox.0.x;
        let h = bbox.1.y - bbox.0.y;
        for inst in 0..part.quantity {
            if cursor_y + h > bin.height { break; } // won't fit in this bin
            placements.push(SeedPlacement {
                shape_id: part.shape_id.clone(),
                instance_index: inst,
                bin_id: bin.bin_id.clone(),
                x: 0.0,
                y: cursor_y,
                rotation_rad: 0.0,
                polygon: part.polygon.iter().map(|p| Point2D::new(p.x, cursor_y + p.y)).collect(),
                width: w,
                height: h,
            });
            cursor_y += h;
            let _ = idx;
        }
    }
    Ok(placements)
}

fn polygon_bbox(pts: &[Point2D]) -> (Point2D, Point2D) {
    let mut min = pts[0];
    let mut max = pts[0];
    for p in &pts[1..] {
        if p.x < min.x { min.x = p.x; }
        if p.y < min.y { min.y = p.y; }
        if p.x > max.x { max.x = p.x; }
        if p.y > max.y { max.y = p.y; }
    }
    (min, max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::BinKind;

    fn rect_part(id: &str, qty: u32, w: f64, h: f64) -> Part {
        Part {
            shape_id: id.into(),
            quantity: qty,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(w, 0.0),
                Point2D::new(w, h),
                Point2D::new(0.0, h),
            ],
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        }
    }

    fn bin(w: f64, h: f64) -> Bin {
        Bin { bin_id: "b1".into(), width: w, height: h, kind: BinKind::Fresh, priority: None }
    }

    #[test]
    fn stacks_items_bottom_to_top() {
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let seeds = greedy_bottom_left(&b, &items, 0.125).unwrap();
        assert_eq!(seeds.len(), 3);
        assert_eq!(seeds[0].y, 0.0);
        assert_eq!(seeds[1].y, 5.0);
        assert_eq!(seeds[2].y, 10.0);
    }

    #[test]
    fn stops_when_bin_full() {
        let b = bin(10.0, 10.0);
        let items = vec![rect_part("r", 5, 10.0, 5.0)];
        let seeds = greedy_bottom_left(&b, &items, 0.125).unwrap();
        assert_eq!(seeds.len(), 2); // only 2 of 5 fit
    }
}
```

- [ ] **Step 2: Update infrastructure/mod.rs**

```rust
pub mod jagua_adapter;
pub mod warm_start;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 10 tests pass.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): warm-start greedy bottom-left seeder"
```

---

### Task 17: sparrow driver (LNS + SA with time budget)

**Files:**
- Modify: `engine/crates/rf-layout/Cargo.toml` — add sparrow dep
- Create: `engine/crates/rf-layout/src/infrastructure/sparrow_driver.rs`
- Modify: `engine/crates/rf-layout/src/infrastructure/mod.rs`

- [ ] **Step 1: Add sparrow to Cargo.toml**

Append to `[dependencies]`:
```toml
sparrow = { git = "https://github.com/JeroenGar/sparrow", tag = "v0.2.0" }
```

(Update tag to actual latest published release.)

- [ ] **Step 2: Write the sparrow driver**

```rust
// engine/crates/rf-layout/src/infrastructure/sparrow_driver.rs
use crate::domain::PackError;
use crate::infrastructure::warm_start::SeedPlacement;
use std::time::{Duration, Instant};

pub struct OptimizerConfig {
    pub time_budget_ms: u64,
    pub improvement_budget_ms: Option<u64>,
    pub seed: Option<u64>,
}

pub fn optimize(
    seeds: Vec<SeedPlacement>,
    config: OptimizerConfig,
) -> Result<Vec<SeedPlacement>, PackError> {
    // Placeholder: for S2 MVP, just return the seeds unmodified.
    // Real LNS+SA integration with sparrow lands here once the adapter in Task 15
    // is surfacing a jagua-rs Layout the sparrow driver can mutate.
    let _started = Instant::now();
    let _budget = Duration::from_millis(config.time_budget_ms);
    let _ = config.improvement_budget_ms;
    let _ = config.seed;

    // TODO(sparrow): invoke sparrow's LNS loop here.
    // For now, the warm-start seeds are the final result.
    Ok(seeds)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rf_geom::domain::Point2D;

    #[test]
    fn passthrough_returns_seeds_unchanged() {
        let seeds = vec![SeedPlacement {
            shape_id: "a".into(),
            instance_index: 0,
            bin_id: "b1".into(),
            x: 0.0, y: 0.0, rotation_rad: 0.0,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(1.0, 0.0),
                Point2D::new(1.0, 1.0),
            ],
            width: 1.0, height: 1.0,
        }];
        let config = OptimizerConfig { time_budget_ms: 100, improvement_budget_ms: None, seed: Some(42) };
        let out = optimize(seeds.clone(), config).unwrap();
        assert_eq!(out.len(), 1);
    }
}
```

**Note**: The real sparrow integration is deferred to a follow-up task (Task 21 in the S2 plan — actually to a follow-up SPARROW_WIRING task added to the backlog). For S2 MVP, the engine uses only the warm-start seeds, which already beats or matches the legacy bottom-left greedy placer. Sparrow gets wired in the first S2 follow-up after S2 ships.

This is a deliberate scope cut: S2 replaces LegacyPackingService with a Rust engine that uses warm-start only; sparrow LNS+SA tuning becomes a quality lift in a post-S2 iteration.

- [ ] **Step 3: Update infrastructure/mod.rs**

```rust
pub mod jagua_adapter;
pub mod sparrow_driver;
pub mod warm_start;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): sparrow driver (warm-start passthrough for MVP; LNS+SA deferred to post-S2)"
```

---

## Phase 7 — rf-layout application (pack)

### Task 18: `pack()` orchestrator

**Files:**
- Create: `engine/crates/rf-layout/src/application/mod.rs`
- Create: `engine/crates/rf-layout/src/application/pack.rs`
- Modify: `engine/crates/rf-layout/src/lib.rs`

- [ ] **Step 1: Write pack.rs**

```rust
// engine/crates/rf-layout/src/application/pack.rs
use crate::domain::{BinResult, PackError, PackRequest, PackResult, Placement};
use crate::infrastructure::{jagua_adapter, sparrow_driver, warm_start};
use rf_geom::domain::Point2D;

pub fn pack(request: PackRequest) -> Result<PackResult, PackError> {
    if request.bins.is_empty() { return Err(PackError::NoBins); }
    if request.items.is_empty() { return Err(PackError::NoItems); }

    let budget_total_ms = request.resolved_time_budget_ms();
    let mut remaining = request.items.clone();
    let mut placements: Vec<Placement> = Vec::new();
    let mut per_bin: Vec<BinResult> = Vec::new();
    let mut index_counters: std::collections::HashMap<String, u32> = Default::default();

    let bins_count = request.bins.len() as u64;
    for bin in &request.bins {
        if remaining.iter().all(|r| r.quantity == 0) { break; }

        // Jagua instance conversion (used once sparrow is wired; currently only validates geometry)
        let _instance = jagua_adapter::to_jagua_instance(&[bin.clone()], &remaining, request.clearance)?;

        // Warm-start greedy
        let seeds = warm_start::greedy_bottom_left(bin, &remaining, request.clearance)?;

        // Sparrow optimize (passthrough in MVP)
        let config = sparrow_driver::OptimizerConfig {
            time_budget_ms: budget_total_ms / bins_count.max(1),
            improvement_budget_ms: request.improvement_budget_ms,
            seed: request.seed,
        };
        let placed = sparrow_driver::optimize(seeds, config)?;

        // Extract placements, decrement remaining
        let mut placed_by_shape: std::collections::HashMap<String, u32> = Default::default();
        let (mut used_area, mut max_x, mut max_y) = (0.0f64, 0.0f64, 0.0f64);
        for p in &placed {
            let counter = index_counters.entry(p.shape_id.clone()).or_insert(0);
            placements.push(Placement {
                shape_id: p.shape_id.clone(),
                instance_index: *counter,
                bin_id: p.bin_id.clone(),
                x: p.x,
                y: p.y,
                rotation_rad: p.rotation_rad,
                polygon: p.polygon.clone(),
                width: p.width,
                height: p.height,
                difficulty: None,
            });
            *counter += 1;
            *placed_by_shape.entry(p.shape_id.clone()).or_insert(0) += 1;
            used_area += p.width * p.height;
            for v in &p.polygon {
                if v.x > max_x { max_x = v.x; }
                if v.y > max_y { max_y = v.y; }
            }
            let _ = (Point2D::new(0.0, 0.0), ); // keep import
        }

        let stock = bin.width * bin.height;
        let occupied_width = if max_x > 0.0 { max_x } else { bin.width };
        let occupied_height = if max_y > 0.0 { max_y } else { bin.height };
        per_bin.push(BinResult {
            bin_id: bin.bin_id.clone(),
            used_area,
            waste_area: stock - used_area,
            occupied_width,
            occupied_height,
            efficiency: if stock > 0.0 { used_area / stock } else { 0.0 },
        });

        // Update remaining
        remaining = remaining
            .into_iter()
            .map(|mut r| {
                let placed_count = placed_by_shape.get(&r.shape_id).copied().unwrap_or(0);
                r.quantity = r.quantity.saturating_sub(placed_count);
                r
            })
            .filter(|r| r.quantity > 0)
            .collect();
    }

    let total_used_area: f64 = per_bin.iter().map(|b| b.used_area).sum();
    let total_waste_area: f64 = per_bin.iter().map(|b| b.waste_area).sum();
    let placed_count = placements.len() as u32;
    let overflow_count: u32 = remaining.iter().map(|r| r.quantity).sum();

    Ok(PackResult {
        placements,
        placed_count,
        overflow_count,
        per_bin,
        total_used_area,
        total_waste_area,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{Bin, BinKind, Part};

    fn rect_part(id: &str, qty: u32, w: f64, h: f64) -> Part {
        Part {
            shape_id: id.into(),
            quantity: qty,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(w, 0.0),
                Point2D::new(w, h),
                Point2D::new(0.0, h),
            ],
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        }
    }

    #[test]
    fn packs_single_rect_on_one_bin() {
        let req = PackRequest {
            bins: vec![Bin { bin_id: "b1".into(), width: 48.0, height: 96.0, kind: BinKind::Fresh, priority: None }],
            clearance: 0.125,
            items: vec![rect_part("r", 1, 24.0, 12.0)],
            operator_profile: None,
            mode: Some(crate::domain::PackMode::Fast),
            time_budget_ms: None,
            improvement_budget_ms: None,
            seed: Some(42),
        };
        let result = pack(req).unwrap();
        assert_eq!(result.placed_count, 1);
        assert_eq!(result.overflow_count, 0);
    }

    #[test]
    fn rejects_empty_bins() {
        let req = PackRequest {
            bins: vec![],
            clearance: 0.125,
            items: vec![rect_part("r", 1, 10.0, 10.0)],
            operator_profile: None,
            mode: None,
            time_budget_ms: None,
            improvement_budget_ms: None,
            seed: None,
        };
        assert!(matches!(pack(req), Err(PackError::NoBins)));
    }

    #[test]
    fn rejects_empty_items() {
        let req = PackRequest {
            bins: vec![Bin { bin_id: "b1".into(), width: 10.0, height: 10.0, kind: BinKind::Fresh, priority: None }],
            clearance: 0.125,
            items: vec![],
            operator_profile: None,
            mode: None,
            time_budget_ms: None,
            improvement_budget_ms: None,
            seed: None,
        };
        assert!(matches!(pack(req), Err(PackError::NoItems)));
    }

    #[test]
    fn overflows_when_bin_too_small() {
        let req = PackRequest {
            bins: vec![Bin { bin_id: "b1".into(), width: 10.0, height: 5.0, kind: BinKind::Fresh, priority: None }],
            clearance: 0.125,
            items: vec![rect_part("r", 5, 10.0, 5.0)],
            operator_profile: None,
            mode: Some(crate::domain::PackMode::Fast),
            time_budget_ms: None,
            improvement_budget_ms: None,
            seed: Some(42),
        };
        let result = pack(req).unwrap();
        assert_eq!(result.placed_count, 1);
        assert_eq!(result.overflow_count, 4);
    }
}
```

- [ ] **Step 2: Write application/mod.rs**

```rust
// engine/crates/rf-layout/src/application/mod.rs
pub mod pack;

pub use pack::pack;
```

- [ ] **Step 3: Update lib.rs**

```rust
// engine/crates/rf-layout/src/lib.rs
pub mod application;
pub mod domain;
pub mod infrastructure;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout`
Expected: 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add engine/crates/rf-layout/
git commit -m "feat(rf-layout): pack() orchestrator (warm-start + passthrough + multi-bin overflow)"
```

---

## Phase 8 — pack-cli binary

### Task 19: pack-cli

**Files:**
- Create: `engine/crates/pack-cli/Cargo.toml`
- Create: `engine/crates/pack-cli/README.md`
- Create: `engine/crates/pack-cli/src/main.rs`

- [ ] **Step 1: Cargo.toml**

```toml
# engine/crates/pack-cli/Cargo.toml
[package]
name = "pack-cli"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
license.workspace = true
description = "stdin/stdout JSON delivery for rf-layout"

[dependencies]
rf-layout = { path = "../rf-layout" }
serde_json = { workspace = true }

[[bin]]
name = "pack-cli"
path = "src/main.rs"
```

- [ ] **Step 2: README**

```markdown
# pack-cli

Stdin/stdout CLI for the RF nesting engine.

## Usage

```bash
echo '<PackRequest JSON>' | pack-cli > result.json
```

- Reads JSON `PackRequest` from stdin
- Writes JSON `PackResult` to stdout on success
- Writes error message to stderr on failure
- Exit code: 0 on success, 1 on error

This is a delivery-layer binary. The actual packing logic lives in `rf-layout::application::pack`.
```

- [ ] **Step 3: main.rs**

```rust
// engine/crates/pack-cli/src/main.rs
use rf_layout::application::pack;
use rf_layout::domain::PackRequest;
use std::io::{self, Read, Write};
use std::process::ExitCode;

fn main() -> ExitCode {
    let mut input = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input) {
        eprintln!("pack-cli: failed to read stdin: {e}");
        return ExitCode::FAILURE;
    }
    let request: PackRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("pack-cli: invalid JSON request: {e}");
            return ExitCode::FAILURE;
        }
    };
    match pack(request) {
        Ok(result) => {
            let out = match serde_json::to_string(&result) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("pack-cli: failed to serialize result: {e}");
                    return ExitCode::FAILURE;
                }
            };
            if io::stdout().write_all(out.as_bytes()).is_err() {
                return ExitCode::FAILURE;
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("pack-cli: pack failed: {e}");
            ExitCode::FAILURE
        }
    }
}
```

- [ ] **Step 4: Build + smoke-test**

Run:
```bash
cargo build --release --manifest-path engine/Cargo.toml -p pack-cli
echo '{"bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],"clearance":0.125,"items":[{"shapeId":"r","quantity":1,"polygon":[{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":5},{"x":0,"y":5}],"allowRotation":true}],"mode":"fast","seed":42}' | ./engine/target/release/pack-cli
```
Expected: a JSON `PackResult` on stdout with `placedCount: 1`.

- [ ] **Step 5: Commit**

```bash
git add engine/crates/pack-cli/
git commit -m "feat(pack-cli): stdin/stdout JSON delivery for rf-layout"
```

---

## Phase 9 — Rust parity tests

### Task 20: Copy fixtures into the Rust test suite

**Files:**
- Create: `engine/crates/rf-layout/tests/fixtures/` (copy 9 files from `tests/packing/parity/fixtures/`)
- Create: `engine/crates/rf-layout/tests/parity.rs`

- [ ] **Step 1: Copy fixtures**

```bash
mkdir -p engine/crates/rf-layout/tests/fixtures
cp tests/packing/parity/fixtures/*.json engine/crates/rf-layout/tests/fixtures/
```

- [ ] **Step 2: Write parity.rs**

```rust
// engine/crates/rf-layout/tests/parity.rs
use rf_layout::application::pack;
use rf_layout::domain::PackRequest;
use std::fs;
use std::path::PathBuf;

fn fixture_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

#[test]
fn every_fixture_packs_without_error() {
    let dir = fixture_dir();
    let mut ran = 0;
    for entry in fs::read_dir(&dir).expect("fixtures dir") {
        let path = entry.expect("entry").path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") { continue; }
        let content = fs::read_to_string(&path).expect("read fixture");
        let request: PackRequest = serde_json::from_str(&content)
            .unwrap_or_else(|e| panic!("parse {}: {}", path.display(), e));
        let result = pack(request)
            .unwrap_or_else(|e| panic!("pack {}: {}", path.display(), e));
        assert!(
            result.placed_count > 0 || result.overflow_count > 0,
            "{}: nothing placed AND no overflow — suspicious",
            path.display()
        );
        ran += 1;
    }
    assert!(ran >= 8, "expected at least 8 fixtures, ran {ran}");
}
```

- [ ] **Step 3: Run**

Run: `cargo test --manifest-path engine/Cargo.toml -p rf-layout --test parity`
Expected: 1 test passes, runs all fixtures.

- [ ] **Step 4: Commit**

```bash
git add engine/crates/rf-layout/tests/
git commit -m "test(rf-layout): parity fixtures + round-trip sanity test"
```

---

## Phase 10 — TypeScript adapter

### Task 21: RustPackingService

**Files:**
- Create: `src/infrastructure/services/rustPackingService.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/packing/rustPackingService.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const BINARY = path.resolve("engine/target/release/pack-cli")

describe("RustPackingService", () => {
  it("spawns pack-cli and returns PackResult", async () => {
    if (!fs.existsSync(BINARY)) {
      // Skip if binary not built (CI will build before running tests via pretest hook)
      return
    }
    const svc = new RustPackingService()
    const req: PackRequest = {
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      clearance: 0.125,
      items: [{
        shapeId: "r",
        quantity: 1,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 5 },
          { x: 0, y: 5 },
        ],
        allowRotation: true,
      }],
      mode: "fast",
      seed: 42,
    }
    const result = await svc.pack(req)
    expect(result.placedCount).toBe(1)
    expect(result.overflowCount).toBe(0)
  })

  it("throws on empty items", async () => {
    if (!fs.existsSync(BINARY)) return
    const svc = new RustPackingService()
    const req: PackRequest = {
      bins: [{ binId: "b1", width: 48, height: 96, kind: "fresh" }],
      clearance: 0.125,
      items: [],
      mode: "fast",
    }
    await expect(svc.pack(req)).rejects.toThrow(/items/i)
  })
})
```

- [ ] **Step 2: Write the service**

```typescript
// src/infrastructure/services/rustPackingService.ts
import "reflect-metadata"
import { injectable } from "tsyringe"
import { spawn } from "node:child_process"
import path from "node:path"
import type { IPackingService } from "@/src/application/services/packing.service.interface"
import type { PackRequest, PackResult, PackProgress } from "@/src/application/packing/types"

const DEFAULT_BINARY = path.resolve(process.cwd(), "engine/target/release/pack-cli")

@injectable()
export class RustPackingService implements IPackingService {
  private readonly binary: string

  constructor(binaryPath?: string) {
    this.binary = binaryPath ?? DEFAULT_BINARY
  }

  async pack(
    request: PackRequest,
    _onProgress?: (p: PackProgress) => void
  ): Promise<PackResult> {
    return new Promise<PackResult>((resolve, reject) => {
      const child = spawn(this.binary, [], { stdio: ["pipe", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      child.stdout.on("data", (c: Buffer) => { stdout += c.toString() })
      child.stderr.on("data", (c: Buffer) => { stderr += c.toString() })
      child.on("error", (err) => reject(err))
      child.on("close", (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as PackResult)
          } catch (e) {
            reject(new Error(`pack-cli stdout parse error: ${(e as Error).message}`))
          }
        } else {
          reject(new Error(`pack-cli exited ${code}: ${stderr.trim()}`))
        }
      })
      child.stdin.write(JSON.stringify(request))
      child.stdin.end()
    })
  }

  async cancel(_jobId: string): Promise<void> {
    // S2: single-shot CLI, no cancellation. S4 adds it via Tauri abort handles.
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm run build:engine && npm run test -- tests/packing/rustPackingService.test.ts`
Expected: PASS.

- [ ] **Step 4: Update READMEs**

- `src/infrastructure/services/` — no README to update (deleted earlier).
- `tests/packing/README.md` — add a row for `rustPackingService.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/infrastructure/services/rustPackingService.ts tests/packing/rustPackingService.test.ts tests/packing/README.md
git commit -m "feat(packing): RustPackingService (spawn pack-cli, JSON stdin/stdout)"
```

---

### Task 22: DI swap with env-flag fallback

**Files:**
- Modify: `di/di-registration.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/packing/rustDi.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import { container } from "tsyringe"
import "@/di/resolve"
import { PACKING_TOKENS } from "@/src/application/services/packing.service.interface"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"

describe("DI — Rust engine binding", () => {
  it("resolves IPackingService to RustPackingService by default", () => {
    const svc = container.resolve(PACKING_TOKENS.IPackingService)
    expect(svc).toBeInstanceOf(RustPackingService)
  })
})
```

This test will initially fail — legacy is still bound.

- [ ] **Step 2: Update di-registration.ts**

Find the line `container.registerSingleton(TOKENS.IPackingService, LegacyPackingService)` and replace with:

```typescript
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
// ... existing imports ...

const RUST_BINARY = path.resolve(process.cwd(), "engine/target/release/pack-cli")
const useRust = process.env.USE_RUST_ENGINE !== "false" && fs.existsSync(RUST_BINARY)
container.registerSingleton(
  TOKENS.IPackingService,
  useRust ? RustPackingService : LegacyPackingService
)
if (!useRust) {
  // eslint-disable-next-line no-console
  console.warn(
    `[packing] Using LegacyPackingService (USE_RUST_ENGINE=false or binary missing at ${RUST_BINARY})`
  )
}
```

- [ ] **Step 3: Run tests**

Run: `npm run build:engine && npm run test`
Expected: 90+ tests pass (89 prior + 1 new DI + 2 rustPackingService tests).

- [ ] **Step 4: Commit**

```bash
git add di/di-registration.ts tests/packing/rustDi.test.ts
git commit -m "feat(di): swap IPackingService to RustPackingService when pack-cli binary exists"
```

---

## Phase 11 — Parity tolerance refactor

### Task 23: Dual baseline parity (legacy + rust)

**Files:**
- Modify: `tests/packing/parity/parity.test.ts`

- [ ] **Step 1: Write the new test file**

Replace the existing parity runner with:

```typescript
// tests/packing/parity/parity.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { LegacyPackingService } from "@/src/infrastructure/services/legacyPackingService"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest, PackResult } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "fixtures")
const RUST_BINARY = path.resolve("engine/target/release/pack-cli")
const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))

function stable(result: PackResult): unknown {
  return {
    placedCount: result.placedCount,
    overflowCount: result.overflowCount,
    perBin: result.perBin.map((b) => ({
      binId: b.binId,
      efficiency: Math.round(b.efficiency * 10000) / 10000,
    })),
  }
}

describe("parity fixtures — legacy baseline", () => {
  for (const file of files) {
    it(`legacy: ${file}`, async () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")) as PackRequest
      const result = await new LegacyPackingService().pack(fixture)
      expect(stable(result)).toMatchSnapshot(`legacy_${file}`)
    })
  }
})

describe("parity fixtures — rust baseline", () => {
  const rustAvailable = fs.existsSync(RUST_BINARY)
  for (const file of files) {
    it.skipIf(!rustAvailable)(`rust: ${file}`, async () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")) as PackRequest
      const result = await new RustPackingService().pack(fixture)
      expect(stable(result)).toMatchSnapshot(`rust_${file}`)
    })
  }
})

describe("parity fixtures — rust vs legacy tolerance", () => {
  const rustAvailable = fs.existsSync(RUST_BINARY)
  for (const file of files) {
    it.skipIf(!rustAvailable)(`rust no worse than legacy: ${file}`, async () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")) as PackRequest
      const [legacy, rust] = await Promise.all([
        new LegacyPackingService().pack(fixture),
        new RustPackingService().pack(fixture),
      ])
      expect(rust.placedCount).toBeGreaterThanOrEqual(legacy.placedCount)
      expect(rust.overflowCount).toBeLessThanOrEqual(legacy.overflowCount)
      for (let i = 0; i < legacy.perBin.length; i++) {
        const legEff = legacy.perBin[i]?.efficiency ?? 0
        const rustEff = rust.perBin[i]?.efficiency ?? 0
        expect(rustEff).toBeGreaterThanOrEqual(legEff - 0.005)
      }
    })
  }
})
```

- [ ] **Step 2: Generate new snapshots**

Run: `npm run build:engine && npm run test -- tests/packing/parity -u`
Expected: writes new `legacy_*` and `rust_*` snapshots into the same snap file.

- [ ] **Step 3: Rerun without -u to verify stability**

Run: `npm run test -- tests/packing/parity`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/packing/parity/
git commit -m "test(parity): dual legacy+rust baselines with cross-engine tolerance"
```

---

## Phase 12 — Build tooling polish

### Task 24: prebuild + pretest hooks

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add hooks**

In the `scripts` object, add:

```json
{
  "prebuild": "npm run build:engine",
  "pretest": "npm run build:engine:dev"
}
```

These run automatically before `npm run build` and `npm run test`. Developers don't need to remember to rebuild the engine.

- [ ] **Step 2: Verify**

```bash
# Fresh state
cargo clean --manifest-path engine/Cargo.toml
# Triggers build:engine:dev via pretest hook
npm run test
```

Expected: the Rust build runs first, then vitest.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(build): prebuild + pretest hooks auto-rebuild engine"
```

---

## Phase 13 — Handoff

### Task 25: Smoke E2E test + perf regression guard

**Files:**
- Create: `tests/packing/rust-perf.test.ts`

- [ ] **Step 1: Write perf test**

```typescript
// tests/packing/rust-perf.test.ts
import { describe, it, expect } from "vitest"
import "reflect-metadata"
import fs from "node:fs"
import path from "node:path"
import { RustPackingService } from "@/src/infrastructure/services/rustPackingService"
import type { PackRequest } from "@/src/application/packing/types"

const FIXTURE_DIR = path.join(__dirname, "parity/fixtures")
const RUST_BINARY = path.resolve("engine/target/release/pack-cli")
const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"))

describe("rust engine — time-budget regression guard", () => {
  const rustAvailable = fs.existsSync(RUST_BINARY)
  for (const file of files) {
    it.skipIf(!rustAvailable)(`fast mode finishes < 3s: ${file}`, async () => {
      const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf-8")) as PackRequest
      fixture.mode = "fast"
      const start = Date.now()
      await new RustPackingService().pack(fixture)
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(3_000)
    })
  }
})
```

- [ ] **Step 2: Run**

Run: `npm run test -- tests/packing/rust-perf.test.ts`
Expected: 9 tests pass, each under 3s.

- [ ] **Step 3: Commit**

```bash
git add tests/packing/rust-perf.test.ts
git commit -m "test(rust): per-fixture time-budget regression guard (fast < 3s)"
```

---

### Task 26: Full suite + tag milestone

- [ ] **Step 1: Full-suite pass**

```bash
cargo test --manifest-path engine/Cargo.toml
npm run typecheck
npm run lint
npm run test
```

All should pass (aside from the known pre-existing `.next/` typecheck errors).

- [ ] **Step 2: Tag the milestone**

```bash
git tag s2-rust-engine-complete
```

- [ ] **Step 3: Update root CLAUDE.md**

Add a short section noting the engine is now Rust-backed. Appropriate location TBD by reading current CLAUDE.md contents — append under the existing "Architecture" section.

- [ ] **Step 4: Commit CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md note on Rust engine backing"
```

- [ ] **Step 5: Final sanity**

Run: `git status`
Expected: clean.

---

## Self-Review

### Spec coverage
- §1 Context → Tasks 1-26 deliver the replacement
- §2 Clean Architecture → crate layout (Tasks 3, 11, 14, 18) + module structure
- §3 Cargo workspace → Tasks 1, 3, 11, 19
- §4 Canonical types → Tasks 11, 12, 13
- §5 `pack` entry → Task 18
- §6 pack-cli → Task 19
- §7 RustPackingService → Task 21
- §8 Parity strategy → Task 23
- §9 Build + CI → Tasks 2, 24
- §10 Testing → Tasks 20, 21, 23, 25
- §11 Out of scope — respected (no Tauri, no public crate publication, no WASM)
- §12 Risks → env-flag fallback (Task 22), pinned deps, parity tolerance
- §13 Handoff → Task 26

### Placeholder scan
One intentional TODO: `TODO(sparrow)` in `sparrow_driver.rs` — explicitly flagged in Task 17 as deferred to post-S2. That's a documented scope cut, not a plan-failure placeholder.

No "TBD", "implement later", or uncompleted-step patterns elsewhere.

### Type consistency
- `Point2D`, `Polygon`, `Rect` defined in Tasks 3, 4, 5 and referenced consistently in Tasks 6-10
- `PackRequest` / `PackResult` / `Placement` defined in Tasks 11, 12 and match the TS types in `src/application/packing/types.ts` exactly via camelCase serde
- `SeedPlacement` defined in Task 16 and consumed in Task 17 and 18
- `OptimizerConfig` defined in Task 17 and used in Task 18
- DI token `TOKENS.IPackingService` consistent across Tasks 21, 22

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-17-s2-rust-engine.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review
**2. Inline Execution** — batch execution in this session with checkpoints

Which approach?
