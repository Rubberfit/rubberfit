// engine/crates/rema-layout/src/infrastructure/search/mod.rs
//
// Search module — the replacement for the S2 sparrow_driver passthrough.
//
// S2.5 scaffolding: the GLS (Guided Local Search) inner loop is ported from
// sparrow's ejor-snapshot (MIT, Gardeyn et al. KU Leuven 2025) across
// subsequent tasks 3-7. The multi-bin FFD + cross-bin swap assignment layer
// is written fresh in tasks 10-12. Progress streaming and cooperative
// cancellation land in task 14.
//
// Current state (task 1): this module is a passthrough, identical in
// observable behavior to the old `sparrow_driver::optimize`. The scaffold
// for `state` and `objective` modules is in place so subsequent tasks can
// slot into a stable public contract.

pub mod gls;
pub mod objective;
pub mod rng;
pub mod state;
pub mod terminator;

use crate::domain::PackError;
use crate::infrastructure::warm_start::SeedResult;

/// Configuration surface for the search. Grows fields across S2.5c
/// (progress callback + cancel token) without breaking task-1 callers.
#[derive(Clone, Debug, Default)]
pub struct OptimizerConfig {
    /// Total wall-clock budget for the search.
    pub time_budget_ms: u64,
    /// Stop early if no improvement for N ms. None = use time_budget_ms only.
    pub improvement_budget_ms: Option<u64>,
    /// Seed for reproducibility. None = non-deterministic.
    pub seed: Option<u64>,
}

/// Run the search over `seed` within `config`'s budgets.
///
/// Task 1: passthrough. The warm-start seed is returned verbatim so the
/// orchestrator in `application::pack` keeps behaving like S2.
/// Task 8: the body becomes the real GLS explore + compress pipeline
/// (still single-bin).
/// Task 12: this single-bin entry point becomes a thin wrapper around a
/// new multi-bin `optimize_multi(request, seeds, cfg)` that owns the
/// cross-bin swap loop. Call sites in `application::pack` will move to
/// the multi-bin API then.
pub fn optimize(
    seed: SeedResult,
    _config: OptimizerConfig,
) -> Result<SeedResult, PackError> {
    // TODO(S2.5a): replace with exploration-then-compression GLS pipeline
    // once `gls` submodule lands (see plan tasks 3-8).
    Ok(seed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::warm_start::SeedPlacement;
    use rema_geom::domain::Point2D;

    fn empty_seed() -> SeedResult {
        SeedResult {
            placements: vec![],
            overflow: 0,
        }
    }

    fn single_placement_seed() -> SeedResult {
        SeedResult {
            placements: vec![SeedPlacement {
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
            }],
            overflow: 0,
        }
    }

    fn cfg(budget_ms: u64) -> OptimizerConfig {
        OptimizerConfig {
            time_budget_ms: budget_ms,
            improvement_budget_ms: None,
            seed: Some(42),
        }
    }

    #[test]
    fn passthrough_returns_seed_unchanged_empty() {
        let seed = empty_seed();
        let out = optimize(seed.clone(), cfg(100)).unwrap();
        assert_eq!(out.placements.len(), 0);
        assert_eq!(out.overflow, seed.overflow);
    }

    #[test]
    fn passthrough_returns_seed_unchanged_single() {
        let seed = single_placement_seed();
        let out = optimize(seed.clone(), cfg(100)).unwrap();
        assert_eq!(out.placements, seed.placements);
        assert_eq!(out.overflow, seed.overflow);
    }

    #[test]
    fn passthrough_preserves_overflow() {
        let mut seed = empty_seed();
        seed.overflow = 7;
        let out = optimize(seed, cfg(100)).unwrap();
        assert_eq!(out.overflow, 7);
    }
}
