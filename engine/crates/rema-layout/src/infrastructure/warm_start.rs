// engine/crates/rema-layout/src/infrastructure/warm_start.rs
use crate::domain::{Bin, Part, PackError};
use rema_geom::domain::Point2D;

/// Greedy bottom-left seeding: for each item, stack vertically starting at y=0.
/// Simple but produces a valid starting layout for sparrow's LNS.
/// This is the S2 MVP packer — sparrow integration lands in S2.5.
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
    let mut placements = Vec::new();
    let mut cursor_y = 0.0f64;
    for part in items {
        let bbox = polygon_bbox(&part.polygon);
        let w = bbox.1.x - bbox.0.x;
        let h = bbox.1.y - bbox.0.y;
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
                    .map(|p| Point2D::new(p.x, cursor_y + p.y))
                    .collect(),
                width: w,
                height: h,
            });
            cursor_y += h;
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

    #[test]
    fn instance_index_starts_at_zero() {
        let b = bin(48.0, 96.0);
        let items = vec![rect_part("r", 2, 10.0, 5.0)];
        let seeds = greedy_bottom_left(&b, &items, 0.125).unwrap();
        assert_eq!(seeds[0].instance_index, 0);
        assert_eq!(seeds[1].instance_index, 1);
    }
}
