// engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs
use crate::domain::{Bin, Part, PackError};

/// Convert a rema domain Part + Bin into jagua-rs' internal types.
/// This is the seam between domain and vendor; no jagua types leak past this module.
pub fn to_jagua_instance(
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<(), PackError> {
    // Full conversion lands in Task 15. For now, stub with a "not yet implemented" error.
    let _ = (bins, items, clearance);
    Err(PackError::EngineFailed("jagua adapter not implemented".into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::BinKind;
    use rema_geom::domain::Point2D;

    #[test]
    fn stub_returns_error_for_now() {
        let bins = vec![Bin {
            bin_id: "b1".into(),
            width: 10.0,
            height: 10.0,
            kind: BinKind::Fresh,
            priority: None,
        }];
        let items: Vec<Part> = vec![Part {
            shape_id: "a".into(),
            quantity: 1,
            polygon: vec![
                Point2D::new(0.0, 0.0),
                Point2D::new(1.0, 0.0),
                Point2D::new(1.0, 1.0),
            ],
            shape_spec: None,
            allow_rotation: true,
            grain_axis: None,
            difficulty: None,
        }];
        let r = to_jagua_instance(&bins, &items, 0.125);
        assert!(r.is_err());
    }
}
