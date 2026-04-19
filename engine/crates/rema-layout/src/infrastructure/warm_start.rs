// engine/crates/rema-layout/src/infrastructure/warm_start.rs
use crate::domain::{Bin, Part, PackError};
use rema_geom::domain::Point2D;

/// Greedy bottom-left seeding: for each item, stack vertically starting at y=0.
/// Simple but produces a valid starting layout for sparrow's LNS.
/// This is the S2 MVP packer — sparrow integration lands in S2.5.
#[derive(Clone, Debug, PartialEq)]
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

/// Result of greedy bottom-left seeding.
///
/// Carries the per-instance placements and the count of requested item
/// instances that did not fit on the bin. Overflow handling is Task 18's
/// responsibility (placing leftover instances on subsequent bins).
#[derive(Clone, Debug, PartialEq)]
pub struct SeedResult {
    pub placements: Vec<SeedPlacement>,
    /// Number of requested item instances that did not fit on this bin.
    pub overflow: u32,
}

/// Greedy bottom-left probe.
///
/// Used both as a warm-start seed for GLS and as a fit oracle for
/// assignment heuristics (Task 10 FFD, Task 11 cross-bin swap).
///
/// Clearance handling (Task 11 hardening):
///   - Width gate: items whose bbox width + 2*clearance exceeds
///     `bin.width` are rejected wholesale (all copies to overflow).
///   - Vertical stacking: each copy consumes `h + 2*clearance` of
///     vertical space. The emitted `y` coordinate is `cursor_y`
///     (the halo's bottom edge); the item's visible bottom sits at
///     `y + clearance`.
///
/// This is CONSERVATIVE vs jagua's exact `min_item_separation = c`
/// semantics (real stack of k copies needs `k*h + (k+1)*c`; we
/// reserve `k*h + 2*k*c`). The probe over-rejects by `(k-1)*c` on
/// deep stacks — acceptable for an assignment-time oracle; downstream
/// CDE in jagua handles exact clearance during placement.
///
/// See `docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md`
/// §2 for the derivation + Codex sign-off at
/// `.claude/research/task11/codex-signoff.md`.
pub fn greedy_bottom_left(
    bin: &Bin,
    items: &[Part],
    clearance: f64,
) -> Result<SeedResult, PackError> {
    let mut placements = Vec::new();
    let mut cursor_y = 0.0f64;
    let mut overflow: u32 = 0;
    for part in items {
        let bbox = rema_geom::application::bbox_of(&part.polygon).map_err(|source| {
            PackError::InvalidPolygon {
                shape_id: part.shape_id.clone(),
                source,
            }
        })?;
        let w = bbox.1.x - bbox.0.x;
        let h = bbox.1.y - bbox.0.y;
        let w_eff = w + 2.0 * clearance;
        let h_eff = h + 2.0 * clearance;

        if w_eff > bin.width {
            overflow += part.quantity;
            continue;
        }

        let mut placed_this_part: u32 = 0;
        for inst in 0..part.quantity {
            if cursor_y + h_eff > bin.height {
                break;
            }
            let y_visible = cursor_y + clearance;
            placements.push(SeedPlacement {
                shape_id: part.shape_id.clone(),
                instance_index: inst,
                bin_id: bin.bin_id.clone(),
                x: clearance,
                y: y_visible,
                rotation_rad: 0.0,
                polygon: part
                    .polygon
                    .iter()
                    .map(|p| Point2D::new(p.x - bbox.0.x + clearance, y_visible + (p.y - bbox.0.y)))
                    .collect(),
                width: w,
                height: h,
            });
            cursor_y += h_eff;
            placed_this_part += 1;
        }
        overflow += part.quantity - placed_this_part;
    }
    Ok(SeedResult { placements, overflow })
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
    fn stacks_items_bottom_to_top_no_clearance() {
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 3);
        assert_eq!(seeds[0].y, 0.0);
        assert_eq!(seeds[1].y, 5.0);
        assert_eq!(seeds[2].y, 10.0);
    }

    #[test]
    fn stacks_items_with_clearance_halo() {
        // Under c=0.125 and h=5, each copy consumes h_eff=5.25. First
        // copy's visible y = 0 + c = 0.125; second = 5.25 + 0.125 = 5.375.
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 3);
        assert!((seeds[0].y - 0.125).abs() < 1e-9);
        assert!((seeds[1].y - 5.375).abs() < 1e-9);
        assert!((seeds[2].y - 10.625).abs() < 1e-9);
    }

    #[test]
    fn stops_when_bin_full() {
        // 10-wide items on a 10-wide bin with c=0 fits; 2 of 5 stack
        // vertically on 10-high bin.
        let b = bin(10.0, 10.0);
        let items = vec![rect_part("r", 5, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        assert_eq!(result.placements.len(), 2);
        assert_eq!(result.overflow, 3);
    }

    #[test]
    fn instance_index_starts_at_zero() {
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 2, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds[0].instance_index, 0);
        assert_eq!(seeds[1].instance_index, 1);
    }

    #[test]
    fn non_origin_polygon_translates_both_axes() {
        let b = bin(100.0, 100.0);
        let offset_part = Part {
            shape_id: "offset".into(),
            quantity: 1,
            polygon: vec![
                Point2D::new(5.0, 3.0),
                Point2D::new(15.0, 3.0),
                Point2D::new(15.0, 8.0),
                Point2D::new(5.0, 8.0),
            ],
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        };
        // c=0 keeps min_x,min_y at 0; the clearance-inflated path is
        // tested in `stacks_items_with_clearance_halo`.
        let result = greedy_bottom_left(&b, &[offset_part], 0.0).unwrap();
        assert_eq!(result.placements.len(), 1);
        let p = &result.placements[0];
        let min_x = p.polygon.iter().map(|pt| pt.x).fold(f64::INFINITY, f64::min);
        let min_y = p.polygon.iter().map(|pt| pt.y).fold(f64::INFINITY, f64::min);
        assert!((min_x - 0.0).abs() < 1e-9);
        assert!((min_y - 0.0).abs() < 1e-9);
    }

    #[test]
    fn overflow_counts_unplaced_instances() {
        let b = bin(10.0, 10.0);
        let items = vec![rect_part("r", 5, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        assert_eq!(result.placements.len(), 2);
        assert_eq!(result.overflow, 3);
    }

    // --- Task 11 probe-hardening tests -----------------------------------

    #[test]
    fn width_gate_rejects_too_wide_items() {
        // Codex finding: prior to the fix, 50x5 items on a 10x100 bin
        // were false-accepted by the probe (vertical stacker ignored
        // width). Now: overflow = full quantity.
        let b = bin(10.0, 100.0);
        let items = vec![rect_part("r", 3, 50.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        assert_eq!(result.placements.len(), 0);
        assert_eq!(result.overflow, 3);
    }

    #[test]
    fn clearance_applies_to_vertical_stacking() {
        // 2x 10x10 items on a 12x25 bin (width picked so w_eff=12 fits).
        //   c=1.0 → h_eff=12, 2 copies consume 24 ≤ 25 → both fit.
        let b1 = bin(12.0, 25.0);
        let items = vec![rect_part("r", 2, 10.0, 10.0)];
        let r1 = greedy_bottom_left(&b1, &items, 1.0).unwrap();
        assert_eq!(r1.placements.len(), 2);
        assert_eq!(r1.overflow, 0);
        //   c=2.0 → h_eff=14, w_eff=14, bin=12 → width gate rejects all.
        let r2 = greedy_bottom_left(&b1, &items, 2.0).unwrap();
        assert_eq!(r2.placements.len(), 0);
        assert_eq!(r2.overflow, 2);
        //   Run the same c=2.0 on a wider bin so only the height check fires.
        let b2 = bin(14.0, 25.0);
        let r3 = greedy_bottom_left(&b2, &items, 2.0).unwrap();
        assert_eq!(r3.placements.len(), 1);
        assert_eq!(r3.overflow, 1);
    }

    #[test]
    fn clearance_applies_to_bin_boundary() {
        // 10x5 item on 11x6 bin (width chosen so w_eff=10.6 ≤ 11).
        //   c=0.3 → h_eff=5.6 ≤ 6 → fits.
        let b = bin(11.0, 6.0);
        let items = vec![rect_part("r", 1, 10.0, 5.0)];
        let r1 = greedy_bottom_left(&b, &items, 0.3).unwrap();
        assert_eq!(r1.placements.len(), 1);
        assert_eq!(r1.overflow, 0);
        //   c=0.4 → h_eff=5.8 ≤ 6 → fits; c=0.6 → h_eff=6.2 > 6 → overflow.
        let r2 = greedy_bottom_left(&b, &items, 0.6).unwrap();
        assert_eq!(r2.placements.len(), 0);
        assert_eq!(r2.overflow, 1);
    }

    #[test]
    fn single_item_exact_boundary() {
        // Codex sign-off: guard against first-item y_offset double-count.
        // H = h + 2c, W = w + 2c means one copy consumes exactly the bin.
        let b = bin(10.0 + 2.0 * 0.5, 10.0 + 2.0 * 0.5);
        let items = vec![rect_part("r", 1, 10.0, 10.0)];
        let r = greedy_bottom_left(&b, &items, 0.5).unwrap();
        assert_eq!(r.placements.len(), 1);
        assert_eq!(r.overflow, 0);
    }

    #[test]
    fn conservative_vs_exact_jagua_semantics() {
        // Codex sign-off: locks conservative over-rejection as documented.
        // Two 10x10 items, c=1, H=23, W=12 (so width gate passes).
        //   Exact jagua (k*h + (k+1)*c): 2*10 + 3*1 = 23 → would fit.
        //   Our uniform (k*h + 2*k*c): 2*10 + 2*2*1 = 24 > 23 → rejects 1.
        let b = bin(12.0, 23.0);
        let items = vec![rect_part("r", 2, 10.0, 10.0)];
        let r = greedy_bottom_left(&b, &items, 1.0).unwrap();
        assert_eq!(r.placements.len(), 1, "conservative probe rejects the second copy");
        assert_eq!(r.overflow, 1);
    }
}
