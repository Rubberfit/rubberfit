// engine/crates/rema-layout/src/infrastructure/sparrow_driver.rs
//
// Sparrow LNS+SA driver. S2 MVP ships a passthrough; S2.5 wires the real search.

use crate::domain::PackError;
use crate::infrastructure::warm_start::SeedResult;
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct OptimizerConfig {
    /// Total wall-clock budget for the search.
    pub time_budget_ms: u64,
    /// Stop early if no improvement for N ms. None = use time_budget_ms only.
    pub improvement_budget_ms: Option<u64>,
    /// Seed for reproducibility. None = non-deterministic.
    pub seed: Option<u64>,
}

pub fn optimize(
    seed: SeedResult,
    config: OptimizerConfig,
) -> Result<SeedResult, PackError> {
    // S2 MVP: passthrough. The warm-start seed is the final result.
    // S2.5 replaces this body with sparrow's LNS+SA iterating within config.time_budget_ms.
    let _started = Instant::now();
    let _budget = Duration::from_millis(config.time_budget_ms);
    let _ = config.improvement_budget_ms;
    let _ = config.seed;

    // TODO(S2.5): invoke sparrow's LNS loop here, mutating jagua-rs Layout
    // and stopping at time_budget_ms or improvement_budget_ms.

    Ok(seed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::infrastructure::warm_start::SeedPlacement;
    use rema_geom::domain::Point2D;

    fn empty_seed() -> SeedResult {
        SeedResult { placements: vec![], overflow: 0 }
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
        assert_eq!(out.placements.len(), 1);
        assert_eq!(out.placements[0].shape_id, "a");
        assert_eq!(out.overflow, 0);
    }

    #[test]
    fn passthrough_preserves_overflow() {
        let mut seed = empty_seed();
        seed.overflow = 7;
        let out = optimize(seed, cfg(100)).unwrap();
        assert_eq!(out.overflow, 7);
    }
}
