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

pub fn greedy_bottom_left(
    bin: &Bin,
    items: &[Part],
    _clearance: f64,
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
        let mut placed_this_part: u32 = 0;
        for inst in 0..part.quantity {
            if cursor_y + h > bin.height {
                break;
            }
            placements.push(SeedPlacement {
                shape_id: part.shape_id.clone(),
                instance_index: inst,
                bin_id: bin.bin_id.clone(),
                x: 0.0,
                y: cursor_y,
                rotation_rad: 0.0,
                polygon: part
                    .polygon
                    .iter()
                    .map(|p| Point2D::new(p.x - bbox.0.x, cursor_y + (p.y - bbox.0.y)))
                    .collect(),
                width: w,
                height: h,
            });
            cursor_y += h;
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
    fn stacks_items_bottom_to_top() {
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 3, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        let seeds = result.placements;
        assert_eq!(seeds.len(), 3);
        assert_eq!(seeds[0].y, 0.0);
        assert_eq!(seeds[1].y, 5.0);
        assert_eq!(seeds[2].y, 10.0);
    }

    #[test]
    fn stops_when_bin_full() {
        let b = bin(10.0, 10.0);
        let items = vec![rect_part("r", 5, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        assert_eq!(result.placements.len(), 2); // only 2 of 5 fit
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
            ], // bbox min = (5,3), max = (15,8), size 10x5
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        };
        let result = greedy_bottom_left(&b, &[offset_part], 0.125).unwrap();
        assert_eq!(result.placements.len(), 1);
        // After translation, polygon bbox min should be at (0, cursor_y=0)
        let p = &result.placements[0];
        let min_x = p.polygon.iter().map(|pt| pt.x).fold(f64::INFINITY, f64::min);
        let min_y = p.polygon.iter().map(|pt| pt.y).fold(f64::INFINITY, f64::min);
        assert!((min_x - 0.0).abs() < 1e-9, "polygon should be translated so min_x = 0");
        assert!((min_y - 0.0).abs() < 1e-9, "polygon should be translated so min_y = 0");
    }

    #[test]
    fn overflow_counts_unplaced_instances() {
        let b = bin(10.0, 10.0);
        let items = vec![rect_part("r", 5, 10.0, 5.0)];
        let result = greedy_bottom_left(&b, &items, 0.125).unwrap();
        assert_eq!(result.placements.len(), 2);
        assert_eq!(result.overflow, 3);
    }
}
