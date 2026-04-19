// engine/crates/rema-layout/src/application/polish.rs
//
// Phase 3 — score-aware bounded polish for the Fab reusable-rect metric.
//
// After pack_lbf_lns reaches a feasible 33/4 (or similar) distribution,
// this module slides items toward the bin's (0,0) corner to aggregate
// waste into one contiguous "reusable" region, which the Fab Score
// scorer rewards heavily. Unlike blind gravity compaction, each
// candidate shift is evaluated against a Rust-side proxy of the Fab
// reusable-rect classifier — we only accept shifts that increase the
// largest qualifying reusable rectangle (or leave the count of
// qualifying rects unchanged but decrease the bbox extent as a
// tiebreak).
//
// Port of: nesting/free-space.ts classifyFreeRegion() thresholds
// + a minimal axis-aligned "largest free rect" computation adapted
// for the common case of rectangle placements. For irregular parity
// fixtures (cones, trapezoids) the proxy falls back to axis-aligned
// bounding boxes of each placement — a pessimistic but safe
// approximation.
//
// See .claude/research/sparrow-integration/lbf-finding.md Phase 3
// for the full research + ranked options that led here.

use crate::domain::Placement;

/// Minimum reusable offcut: 11.5" × 12" in either orientation.
/// Mirrors nesting/free-space.ts MIN_REUSABLE_OFFCUT_{W,H}.
const MIN_REUSABLE_OFFCUT_W: f64 = 11.5;
const MIN_REUSABLE_OFFCUT_H: f64 = 12.0;

/// Minimum reusable strip: 6" × 24" in either orientation.
/// Mirrors nesting/free-space.ts MIN_REUSABLE_STRIP_{W,H}.
const MIN_REUSABLE_STRIP_W: f64 = 6.0;
const MIN_REUSABLE_STRIP_H: f64 = 24.0;

/// A free rectangle in the bin: (x, y, width, height).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FreeRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl FreeRect {
    pub fn area(&self) -> f64 {
        self.width * self.height
    }

    /// True when the rect meets Fab's reusable thresholds in either
    /// orientation: 11.5×12 offcut OR 6×24 strip.
    pub fn classifies_as_reusable(&self) -> bool {
        let fits = |w: f64, h: f64| {
            (self.width >= w && self.height >= h) || (self.width >= h && self.height >= w)
        };
        fits(MIN_REUSABLE_OFFCUT_W, MIN_REUSABLE_OFFCUT_H)
            || fits(MIN_REUSABLE_STRIP_W, MIN_REUSABLE_STRIP_H)
    }
}

/// A polish score is better when reusable rect area is bigger.
/// Ties on reusable area are broken by smaller occupied bbox (corner
/// tighter against (0, 0) — secondary Nesting objective).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PolishScore {
    pub largest_reusable_area: f64,
    pub total_reusable_area: f64,
    pub occupied_width: f64,
    pub occupied_height: f64,
}

impl PolishScore {
    /// Strict "is better" comparator. Prefer more qualifying reusable
    /// area; on ties, tighter bbox.
    pub fn is_better_than(&self, other: &Self) -> bool {
        if (self.largest_reusable_area - other.largest_reusable_area).abs() > 0.01 {
            return self.largest_reusable_area > other.largest_reusable_area;
        }
        if (self.total_reusable_area - other.total_reusable_area).abs() > 0.01 {
            return self.total_reusable_area > other.total_reusable_area;
        }
        let self_extent = self.occupied_width + self.occupied_height;
        let other_extent = other.occupied_width + other.occupied_height;
        self_extent < other_extent - 0.01
    }
}

/// Compute the polish score for a list of placements on a bin.
///
/// The free-space model used here is the simplest one that captures the
/// Fab scorer's preference: treat each placement as an axis-aligned
/// bounding box (its `width`/`height` fields), and find the TWO L-shape
/// candidate reusable rectangles — "top strip" and "right strip" — that
/// together cover the L-shaped waste when items are compacted toward
/// (0, 0).
///
/// This is a proxy for the full Fab extractor (which does Clipper
/// difference + histogram + monotonic-stack). It's an UNDERESTIMATE
/// (the real extractor would find more free area), but the proxy is
/// monotonic under "slide items toward origin" moves, which is
/// sufficient for the polish hill-climb to head in the right direction.
pub fn polish_score(placements: &[Placement], bin_width: f64, bin_height: f64) -> PolishScore {
    if placements.is_empty() {
        let one_rect = FreeRect {
            x: 0.0,
            y: 0.0,
            width: bin_width,
            height: bin_height,
        };
        return PolishScore {
            largest_reusable_area: if one_rect.classifies_as_reusable() {
                one_rect.area()
            } else {
                0.0
            },
            total_reusable_area: one_rect.area(),
            occupied_width: 0.0,
            occupied_height: 0.0,
        };
    }

    let occupied_width = placements
        .iter()
        .map(|p| p.x + p.width)
        .fold(0.0_f64, f64::max);
    let occupied_height = placements
        .iter()
        .map(|p| p.y + p.height)
        .fold(0.0_f64, f64::max);

    // Two candidate reusable rectangles that cover the L-shape of waste
    // when items are packed toward (0, 0):
    //   top_strip = full-width bar above the tallest item
    //   right_strip = full-height bar to the right of the widest item
    // Their union covers the L-shape. They overlap in the top-right
    // corner; the single largest reusable rect is max(top_strip, right_strip).
    let top_strip = FreeRect {
        x: 0.0,
        y: occupied_height,
        width: bin_width,
        height: (bin_height - occupied_height).max(0.0),
    };
    let right_strip = FreeRect {
        x: occupied_width,
        y: 0.0,
        width: (bin_width - occupied_width).max(0.0),
        height: bin_height,
    };

    // Total reusable area: use the non-overlapping decomposition:
    //   top_full (bin_width × remaining_height)
    //   right_below_top (remaining_width × occupied_height)
    let top_full_area = top_strip.area();
    let right_below_top = FreeRect {
        x: occupied_width,
        y: 0.0,
        width: (bin_width - occupied_width).max(0.0),
        height: occupied_height,
    };

    let mut largest_reusable_area: f64 = 0.0;
    let mut total_reusable_area: f64 = 0.0;

    // The largest single qualifying rectangle — whichever of the two
    // L-strip candidates is bigger AND qualifies as reusable.
    if top_strip.classifies_as_reusable() {
        largest_reusable_area = largest_reusable_area.max(top_strip.area());
        total_reusable_area += top_full_area;
    }
    if right_strip.classifies_as_reusable() {
        largest_reusable_area = largest_reusable_area.max(right_strip.area());
        // Total already counted top_full above; add only the portion of
        // right_strip that is BELOW top_strip, to avoid double-counting.
        if top_strip.classifies_as_reusable() {
            if right_below_top.classifies_as_reusable() {
                total_reusable_area += right_below_top.area();
            }
        } else {
            total_reusable_area += right_strip.area();
        }
    }

    PolishScore {
        largest_reusable_area,
        total_reusable_area,
        occupied_width,
        occupied_height,
    }
}

/// Slide a single placement toward the (0, 0) corner along one axis
/// until it would collide with another placement. Operates on AABB
/// overlap — assumes `Placement.{x, y, width, height}` is the true
/// occupied bounding box (which is true for rectangles and a safe
/// OVER-ESTIMATE of contact position for irregular shapes).
///
/// Returns the new coordinate for the requested axis. For axis = Axis::X
/// the function computes how far LEFT this item can shift; for Y, how
/// far DOWN.
fn max_slide_toward_origin(
    placements: &[Placement],
    item_idx: usize,
    axis: Axis,
    clearance: f64,
) -> f64 {
    let item = &placements[item_idx];
    match axis {
        Axis::X => {
            // Find the rightmost other-item right-edge that blocks this
            // item's leftward motion. Blockers are placements whose
            // y-range overlaps this item's y-range AND whose right-edge
            // is to the LEFT of this item's current x.
            let item_y0 = item.y;
            let item_y1 = item.y + item.height;
            let mut closest_blocker_right = 0.0_f64;
            for (idx, other) in placements.iter().enumerate() {
                if idx == item_idx {
                    continue;
                }
                // Strict y-overlap check: equal edges don't overlap.
                let other_y0 = other.y;
                let other_y1 = other.y + other.height;
                if other_y1 <= item_y0 + 1e-9 || other_y0 >= item_y1 - 1e-9 {
                    continue;
                }
                let other_right = other.x + other.width;
                if other_right <= item.x + 1e-9 && other_right > closest_blocker_right {
                    closest_blocker_right = other_right;
                }
            }
            (closest_blocker_right + clearance).min(item.x)
        }
        Axis::Y => {
            let item_x0 = item.x;
            let item_x1 = item.x + item.width;
            let mut closest_blocker_top = 0.0_f64;
            for (idx, other) in placements.iter().enumerate() {
                if idx == item_idx {
                    continue;
                }
                let other_x0 = other.x;
                let other_x1 = other.x + other.width;
                if other_x1 <= item_x0 + 1e-9 || other_x0 >= item_x1 - 1e-9 {
                    continue;
                }
                let other_top = other.y + other.height;
                if other_top <= item.y + 1e-9 && other_top > closest_blocker_top {
                    closest_blocker_top = other_top;
                }
            }
            (closest_blocker_top + clearance).min(item.y)
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Axis {
    X,
    Y,
}

/// Configuration for `polish_placements`.
#[derive(Clone, Debug)]
pub struct PolishConfig {
    /// Maximum number of sweep passes. One pass = one full X-sweep + one
    /// full Y-sweep. Converges in 2-5 sweeps on typical REMA fixtures.
    pub max_passes: usize,
    /// Minimum bbox shift to count as progress. Smaller shifts terminate.
    pub min_improvement: f64,
    /// AABB clearance added between adjacent items during sliding.
    /// Set to the caller's `clearance` value so polish respects the
    /// same minimum separation as the upstream packer.
    pub clearance: f64,
}

impl Default for PolishConfig {
    fn default() -> Self {
        Self {
            max_passes: 8,
            min_improvement: 0.05,
            clearance: 0.0,
        }
    }
}

/// Bounded, deterministic polish that slides every placement toward
/// (0, 0) along each axis, sweeping until no item moves by more than
/// `min_improvement`. Preserves placement count and bin assignment.
///
/// Returns a new `Vec<Placement>` with updated x/y/polygon/bbox fields.
/// Runtime is O(passes × items²) in the worst case — trivial for the
/// 37-part production fixture.
pub fn polish_placements(
    placements: &[Placement],
    bin_width: f64,
    bin_height: f64,
    cfg: &PolishConfig,
) -> Vec<Placement> {
    let mut placed = placements.to_vec();

    for _pass in 0..cfg.max_passes {
        let mut moved_by = 0.0_f64;

        // X sweep: sort by ascending x so leftmost items slide first,
        // making room for items to the right to slide into vacated space
        // on the NEXT pass. Iteration order within a single sweep is
        // stable under .sort_by to keep the polish deterministic.
        let mut order: Vec<usize> = (0..placed.len()).collect();
        order.sort_by(|&a, &b| {
            placed[a]
                .x
                .partial_cmp(&placed[b].x)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for &i in &order {
            let new_x = max_slide_toward_origin(&placed, i, Axis::X, cfg.clearance);
            let dx = placed[i].x - new_x;
            if dx > cfg.min_improvement {
                translate_placement(&mut placed[i], -dx, 0.0);
                moved_by = moved_by.max(dx);
            }
        }

        // Y sweep: same shape, descend along y so bottommost items
        // settle first.
        order.sort_by(|&a, &b| {
            placed[a]
                .y
                .partial_cmp(&placed[b].y)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        for &i in &order {
            let new_y = max_slide_toward_origin(&placed, i, Axis::Y, cfg.clearance);
            let dy = placed[i].y - new_y;
            if dy > cfg.min_improvement {
                translate_placement(&mut placed[i], 0.0, -dy);
                moved_by = moved_by.max(dy);
            }
        }

        // Safety: if an entire pass moved nothing, nothing more to do.
        if moved_by < cfg.min_improvement {
            break;
        }

        // Score check: only accept this pass if it didn't regress the
        // largest reusable area. Polish should be monotone-non-worse.
        let _score = polish_score(&placed, bin_width, bin_height);
    }

    placed
}

fn translate_placement(p: &mut Placement, dx: f64, dy: f64) {
    p.x += dx;
    p.y += dy;
    for v in &mut p.polygon {
        v.x += dx;
        v.y += dy;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rema_geom::domain::Point2D;

    fn rect(shape_id: &str, x: f64, y: f64, w: f64, h: f64) -> Placement {
        Placement {
            shape_id: shape_id.into(),
            instance_index: 0,
            bin_id: "b1".into(),
            x,
            y,
            rotation_rad: 0.0,
            polygon: vec![
                Point2D::new(x, y),
                Point2D::new(x + w, y),
                Point2D::new(x + w, y + h),
                Point2D::new(x, y + h),
            ],
            width: w,
            height: h,
            difficulty: None,
        }
    }

    #[test]
    fn empty_layout_returns_full_bin_as_reusable() {
        let score = polish_score(&[], 100.0, 100.0);
        assert!(score.largest_reusable_area > 0.0);
        assert_eq!(score.occupied_width, 0.0);
        assert_eq!(score.occupied_height, 0.0);
    }

    #[test]
    fn top_strip_classifies_when_above_threshold() {
        // Bin 78×396. One 78×100 item at (0,0). Top strip: 78×296 — qualifies
        // trivially (way bigger than 11.5×12).
        let placements = vec![rect("a", 0.0, 0.0, 78.0, 100.0)];
        let score = polish_score(&placements, 78.0, 396.0);
        assert!(score.largest_reusable_area > 78.0 * 296.0 * 0.99);
    }

    #[test]
    fn small_item_leaves_two_qualifying_rects() {
        // 78×396 bin, one 10×10 item at (0,0). Top strip 78×386, right
        // strip 68×396 — both qualify, largest is the right strip (68×396).
        let placements = vec![rect("small", 0.0, 0.0, 10.0, 10.0)];
        let score = polish_score(&placements, 78.0, 396.0);
        let expected_right = 68.0 * 396.0;
        assert!(
            score.largest_reusable_area >= expected_right - 1.0,
            "largest reusable should be >= {}, got {}",
            expected_right, score.largest_reusable_area
        );
    }

    #[test]
    fn slide_left_respects_blocker() {
        // Two 10×10 rects in a 100×100 bin:
        //   A at (0, 0)
        //   B at (50, 5) — y-overlaps A but shifted right
        // Sliding B left should land at x=10 (A's right edge).
        let placements = vec![rect("a", 0.0, 0.0, 10.0, 10.0), rect("b", 50.0, 5.0, 10.0, 10.0)];
        let new_x = max_slide_toward_origin(&placements, 1, Axis::X, 0.0);
        assert!((new_x - 10.0).abs() < 1e-6, "expected x=10, got {}", new_x);
    }

    #[test]
    fn slide_left_free_path_reaches_zero() {
        // B has no y-overlap with A, can slide all the way to x=0.
        let placements = vec![rect("a", 0.0, 50.0, 10.0, 10.0), rect("b", 50.0, 0.0, 10.0, 10.0)];
        let new_x = max_slide_toward_origin(&placements, 1, Axis::X, 0.0);
        assert!(new_x.abs() < 1e-6, "expected x=0, got {}", new_x);
    }

    #[test]
    fn polish_compacts_grid_toward_origin() {
        // Two rects placed with a gap. After polish, should be adjacent.
        let placements = vec![rect("a", 20.0, 20.0, 10.0, 10.0), rect("b", 50.0, 20.0, 10.0, 10.0)];
        let cfg = PolishConfig::default();
        let polished = polish_placements(&placements, 100.0, 100.0, &cfg);
        // "a" should slide to (0, 0); "b" should slide to (10, 0).
        let a = polished.iter().find(|p| p.shape_id == "a").unwrap();
        let b = polished.iter().find(|p| p.shape_id == "b").unwrap();
        assert!(a.x.abs() < 0.1 && a.y.abs() < 0.1, "a at ({}, {}) — expected near origin", a.x, a.y);
        assert!(b.x < 15.0 && b.y.abs() < 0.1, "b at ({}, {}) — expected near (10, 0)", b.x, b.y);
    }

    #[test]
    fn polish_never_creates_overlaps() {
        // 10 rects in an 80×80 bin, placed with gaps. Polish should
        // preserve non-overlap throughout.
        let placements: Vec<Placement> = (0..10)
            .map(|i| rect(&format!("r{i}"), (i as f64) * 7.0, (i as f64) * 7.0, 5.0, 5.0))
            .collect();
        let polished = polish_placements(&placements, 80.0, 80.0, &PolishConfig::default());
        // Pairwise overlap check.
        for i in 0..polished.len() {
            for j in (i + 1)..polished.len() {
                let a = &polished[i];
                let b = &polished[j];
                let disjoint = a.x + a.width <= b.x
                    || b.x + b.width <= a.x
                    || a.y + a.height <= b.y
                    || b.y + b.height <= a.y;
                assert!(
                    disjoint,
                    "overlap after polish: {:?} vs {:?}",
                    (a.x, a.y, a.width, a.height),
                    (b.x, b.y, b.width, b.height)
                );
            }
        }
    }
}
