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
    // Task 19a/19c dispatcher:
    //   - Homogeneous single-shape inputs: 2D grid packer (Task 19a).
    //   - Heterogeneous inputs: rectangle-pack-backed 2D allocator
    //     (Task 19c) — closes the gap measured in the production cut
    //     benchmark (legacy 37/37 at 70.5% vs prior Rust 8/37 at 44%).
    //   - Inputs that rectangle-pack can't handle (e.g. all copies
    //     exceeding a dimension): vertical-stacker fallback for
    //     deterministic overflow accounting.
    //
    // Codex sign-off rejected guillotiere and hand-rolled shelf packers;
    // rectangle-pack chosen for deterministic free-section splitting
    // with public `available_bin_sections()` visibility. Algorithm is
    // inspired by rectpack2D (NOT MAXRECTS as originally scoped — the
    // crate docs clarify this).
    //
    // Rotation: rectangle-pack exposes rotation flags in RectToInsert
    // but 0.4.2 does NOT implement rotation internally (source has
    // `TODO: Implement rotations`). For this task we pack with the
    // natural orientation only. Real-world fabric/rubber cut lists
    // rarely need rotation when item dimensions fit the bin; the
    // production benchmark confirms this (all 37 parts fit 78×396 in
    // natural orientation).
    if items.len() == 1 {
        return greedy_2d_grid(bin, &items[0], clearance);
    }
    match greedy_rectangle_pack(bin, items, clearance) {
        Ok(result) => Ok(result),
        Err(_) => {
            // Fallback to vertical stacker on any packer error. Keeps
            // overflow accounting deterministic even if rectangle-pack
            // rejects the whole set.
            greedy_vertical_stack(bin, items, clearance)
        }
    }
}

/// Task 19c: heterogeneous 2D packer backed by `rectangle-pack`.
///
/// Scales f64 coordinates to u32 via a fixed 10000x factor (1e4 —
/// keeps 78×396 inputs well within u32::MAX while preserving 0.0001"
/// precision). Codex sign-off §2.3 locks this scale; do NOT reuse
/// rema-geom's 1e7 Clipper scale — it would overflow u32 at 396".
fn greedy_rectangle_pack(
    bin: &Bin,
    items: &[Part],
    clearance: f64,
) -> Result<SeedResult, PackError> {
    use rectangle_pack::{
        contains_smallest_box, pack_rects, volume_heuristic, GroupedRectsToPlace, RectToInsert,
        TargetBin,
    };
    use std::collections::BTreeMap;

    const SCALE: f64 = 10_000.0;

    let clearance_scaled = (clearance * SCALE).round() as u32;
    let bin_w_scaled = (bin.width * SCALE).round() as u32;
    let bin_h_scaled = (bin.height * SCALE).round() as u32;

    // Rect id = (shape_id, instance_ordinal). rectangle-pack wants one
    // RectToInsert per copy — we expand quantities here and map back
    // to SeedPlacements after.
    #[derive(Debug, Hash, PartialEq, Eq, Clone, Ord, PartialOrd)]
    struct RectKey(String, u32);

    let mut rects_to_place = GroupedRectsToPlace::<RectKey, ()>::new();
    let mut part_meta: std::collections::HashMap<String, (usize, f64, f64, Vec<Point2D>)> =
        std::collections::HashMap::new();

    for (part_idx, part) in items.iter().enumerate() {
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

        // Width/height gate: item must fit at least ONE copy.
        if w_eff > bin.width || h_eff > bin.height {
            continue;
        }

        let w_scaled = (w_eff * SCALE).round() as u32;
        let h_scaled = (h_eff * SCALE).round() as u32;

        part_meta.insert(
            part.shape_id.clone(),
            (
                part_idx,
                w,
                h,
                part.polygon.iter().map(|p| Point2D::new(p.x - bbox.0.x, p.y - bbox.0.y)).collect(),
            ),
        );

        for instance in 0..part.quantity {
            rects_to_place.push_rect(
                RectKey(part.shape_id.clone(), instance),
                None,
                RectToInsert::new(w_scaled, h_scaled, 1),
            );
        }
    }

    // Single-bin for now; multi-bin is handled one level up by FFD.
    let mut target_bins = BTreeMap::new();
    target_bins.insert((), TargetBin::new(bin_w_scaled, bin_h_scaled, 1));

    let pack_result = pack_rects(
        &rects_to_place,
        &mut target_bins,
        &volume_heuristic,
        &contains_smallest_box,
    );

    let placements_map = match pack_result {
        Ok(ok) => ok.packed_locations().clone(),
        Err(_) => {
            // rectangle-pack returns an error if ANY rect fails to pack.
            // Propagate up — caller falls back to vertical stacker.
            return Err(PackError::EngineFailed(
                "rectangle-pack: not all rectangles placed".into(),
            ));
        }
    };

    // Emit SeedPlacements in canonical order: sort keys so repeated
    // runs produce bit-identical output. Assign per-shape instance
    // indices fresh (0..quantity).
    let mut sorted_keys: Vec<_> = placements_map.keys().cloned().collect();
    sorted_keys.sort();

    let mut per_shape_counter: std::collections::HashMap<String, u32> =
        std::collections::HashMap::new();
    let mut placements = Vec::with_capacity(sorted_keys.len());

    for key in sorted_keys {
        let (_bin_id, location) = &placements_map[&key];
        let (_, w, h, _canonical_poly) = &part_meta[&key.0];

        // rectangle-pack gives us the cell origin (including clearance
        // halo). Visible item sits at cell_origin + (clearance, clearance).
        let x_cell = (location.x() as f64) / SCALE;
        let y_cell = (location.y() as f64) / SCALE;
        let x_visible = x_cell + clearance;
        let y_visible = y_cell + clearance;

        let instance_index = *per_shape_counter
            .entry(key.0.clone())
            .and_modify(|c| *c += 1)
            .or_insert(0);

        let original_part = items.iter().find(|p| p.shape_id == key.0).unwrap();
        let bbox = rema_geom::application::bbox_of(&original_part.polygon).unwrap();
        let polygon = original_part
            .polygon
            .iter()
            .map(|p| Point2D::new(p.x - bbox.0.x + x_visible, y_visible + (p.y - bbox.0.y)))
            .collect();

        placements.push(SeedPlacement {
            shape_id: key.0,
            instance_index,
            bin_id: bin.bin_id.clone(),
            x: x_visible,
            y: y_visible,
            rotation_rad: 0.0,
            polygon,
            width: *w,
            height: *h,
        });
    }

    let total_requested: u32 = items.iter().map(|p| p.quantity).sum();
    let _ = clearance_scaled;
    Ok(SeedResult {
        overflow: total_requested.saturating_sub(placements.len() as u32),
        placements,
    })
}

/// Vertical-stack packer — original Task 11 implementation.
///
/// Fallback for heterogeneous bins. Stacks items at x=clearance,
/// advancing cursor_y by h_eff = h + 2*clearance per copy. Conservative
/// over-rejection on interior stacks (see rustdoc on
/// `greedy_bottom_left`).
fn greedy_vertical_stack(
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

/// 2D bbox-grid packer for homogeneous single-shape bins.
///
/// Divides the bin into `cols × rows` bbox-aligned cells of size
/// `w_eff × h_eff = (w + 2c) × (h + 2c)`. Places copies row-major
/// (bottom-to-top, left-to-right) into the cells until capacity or
/// quantity runs out.
///
/// Correctness: cells are non-overlapping under the Task 11 conservative
/// clearance model — two adjacent copies' halos meet exactly at the
/// cell boundary, so downstream CDE collision detection will accept
/// them.
///
/// Deterministic: pure arithmetic, row-major scan, no RNG.
fn greedy_2d_grid(
    bin: &Bin,
    part: &Part,
    clearance: f64,
) -> Result<SeedResult, PackError> {
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

    if w_eff > bin.width || h_eff > bin.height {
        // Item doesn't even fit one copy.
        return Ok(SeedResult {
            placements: vec![],
            overflow: part.quantity,
        });
    }

    let cols = (bin.width / w_eff).floor() as u32;
    let rows = (bin.height / h_eff).floor() as u32;
    let capacity = cols.saturating_mul(rows);
    let placed_n = part.quantity.min(capacity);
    let overflow = part.quantity - placed_n;

    let mut placements = Vec::with_capacity(placed_n as usize);
    for k in 0..placed_n {
        let j = k / cols; // row
        let i = k % cols; // column
        let x_halo = (i as f64) * w_eff;
        let y_halo = (j as f64) * h_eff;
        let x_visible = x_halo + clearance;
        let y_visible = y_halo + clearance;
        placements.push(SeedPlacement {
            shape_id: part.shape_id.clone(),
            instance_index: k,
            bin_id: bin.bin_id.clone(),
            x: x_visible,
            y: y_visible,
            rotation_rad: 0.0,
            polygon: part
                .polygon
                .iter()
                .map(|p| {
                    Point2D::new(
                        p.x - bbox.0.x + x_visible,
                        y_visible + (p.y - bbox.0.y),
                    )
                })
                .collect(),
            width: w,
            height: h,
        });
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
    fn grid_places_items_row_major_no_clearance() {
        // Task 19a: homogeneous single-part inputs now route through the
        // 2D grid packer. 48-wide bin, 10-wide items → cols=4; items
        // 0-3 land at y=0 with x=0/10/20/30. (Row-major ordering.)
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 3);
        for s in &seeds {
            assert_eq!(s.y, 0.0, "all 3 copies fit in row 0");
        }
        assert_eq!(seeds[0].x, 0.0);
        assert_eq!(seeds[1].x, 10.0);
        assert_eq!(seeds[2].x, 20.0);
    }

    #[test]
    fn grid_places_items_with_clearance_halo() {
        // c=0.125, w=10, h=5 → cells of 10.25×5.25. cols=floor(48/10.25)=4.
        // Items 0-3 in row 0 at x={0.125, 10.375, 20.625, 30.875}, all y=0.125.
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 3);
        for s in &seeds {
            assert!((s.y - 0.125).abs() < 1e-9, "row 0 @ y = clearance");
        }
        assert!((seeds[0].x - 0.125).abs() < 1e-9);
        assert!((seeds[1].x - 10.375).abs() < 1e-9);
        assert!((seeds[2].x - 20.625).abs() < 1e-9);
    }

    #[test]
    fn grid_wraps_to_next_row_when_cols_exhausted() {
        // 3-col bin, 7 items → row 0 fills 3, row 1 fills 3, row 2 has 1.
        let b = bin(30.0, 30.0);
        let items = vec![rect_part("r", 7, 10.0, 10.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 7);
        // Row 0: y=0, x = 0, 10, 20
        assert_eq!(seeds[0].y, 0.0);
        assert_eq!(seeds[0].x, 0.0);
        assert_eq!(seeds[1].x, 10.0);
        assert_eq!(seeds[2].x, 20.0);
        // Row 1: y=10, x = 0, 10, 20
        assert_eq!(seeds[3].y, 10.0);
        assert_eq!(seeds[3].x, 0.0);
        // Row 2: y=20, x = 0
        assert_eq!(seeds[6].y, 20.0);
        assert_eq!(seeds[6].x, 0.0);
    }

    #[test]
    fn grid_capacity_triggers_overflow() {
        // 30×30 bin, 10× 10×10 items → grid capacity = 9, overflow = 1.
        let b = bin(30.0, 30.0);
        let items = vec![rect_part("r", 10, 10.0, 10.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        assert_eq!(result.placements.len(), 9);
        assert_eq!(result.overflow, 1);
    }

    #[test]
    fn heterogeneous_uses_rectangle_pack() {
        // Task 19c: multi-part (heterogeneous) inputs now route through
        // rectangle-pack for 2D packing. Two 10×5 parts on a 48×96 bin
        // get placed without vertical stacking — rectangle-pack picks
        // positions based on its section-splitting heuristic.
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("a", 1, 10.0, 5.0), rect_part("b", 1, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.0).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 2, "both heterogeneous parts should fit");
        assert_eq!(result.overflow, 0);
        // Placements should be within the bin bounds.
        for seed in &seeds {
            assert!(seed.x >= 0.0 && seed.x + seed.width <= 48.0);
            assert!(seed.y >= 0.0 && seed.y + seed.height <= 96.0);
        }
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
