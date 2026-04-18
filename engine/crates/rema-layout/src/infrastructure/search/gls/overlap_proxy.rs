// engine/crates/rema-layout/src/infrastructure/search/gls/overlap_proxy.rs
//
// Ported from sparrow's `src/quantify/overlap_proxy.rs` (MIT, Copyright 2025
// Jeroen Gardeyn, KU Leuven). See Algorithm 3 in
// <https://doi.org/10.48550/arXiv.2509.13329>.
//
// The function body is a verbatim port — the math is the published
// contribution, and re-deriving it is unnecessary. SIMD feature dropped
// (upstream gates this behind `#[cfg(feature = "simd")]` and imports a
// separate `simd` module we do not port).

use jagua_rs::geometry::fail_fast::SPSurrogate;
use jagua_rs::geometry::geo_traits::DistanceTo;
use std::f32::consts::PI;

/// Calculates a proxy for the overlap area between two simple polygons (using poles).
/// Algorithm 3 from <https://doi.org/10.48550/arXiv.2509.13329>.
#[inline(always)]
pub fn overlap_area_proxy(sp1: &SPSurrogate, sp2: &SPSurrogate, epsilon: f32) -> f32 {
    let mut total_overlap = 0.0;
    for p1 in &sp1.poles {
        for p2 in &sp2.poles {
            // Penetration depth between the two poles (circles)
            let pd = (p1.radius + p2.radius) - p1.center.distance_to(&p2.center);

            let pd_decay = match pd >= epsilon {
                true => pd,
                false => epsilon.powi(2) / (-pd + 2.0 * epsilon),
            };

            total_overlap += pd_decay * f32::min(p1.radius, p2.radius);
        }
    }
    total_overlap *= PI;
    debug_assert!(total_overlap.is_normal());

    total_overlap
}
