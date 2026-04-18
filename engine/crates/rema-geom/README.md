# rema-geom

2D geometry primitives for the REMA nesting engine.

## Layout

- `src/domain/` — pure types (Point2D, Polygon, Rect) + invariants
- `src/application/` — operations (normalize, convex hull, SAT, inscribed rects)
- `src/infrastructure/` — vendor wrappers (clipper2)

## Public API (v0.1)

```rust
use rema_geom::domain::{Point2D, Polygon, Rect};
use rema_geom::application::{normalize_polygon, convex_hull, sat_overlap, maximal_inscribed_rects};
use rema_geom::infrastructure::clipper;
```

Polygons are CCW with min-corner at (0, 0). All linear dimensions are unitless — callers supply consistent units (REMA uses inches).
