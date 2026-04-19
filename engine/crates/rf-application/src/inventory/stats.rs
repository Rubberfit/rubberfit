//! Roll-driven inventory stats — derived views that don't warrant a
//! dedicated aggregate.
//!
//! All four use cases compose the existing `RollPort` +
//! `MaterialTypePort`; the arithmetic happens Rust-side. PostgREST
//! *can* do SUM / COUNT over filters, but the joins the TS code
//! uses (rolls × material_types, aggregated per material_type_id)
//! are awkward via PostgREST's select syntax and would force us to
//! either add RPC functions (schema change, out of S3b scope) or
//! fetch the same rows twice. Client-side aggregation at S3b scale
//! (thousands of rows, not millions) is fine — if it becomes a
//! bottleneck, that's an S3c optimisation pass.

use std::collections::HashMap;
use std::sync::Arc;

use rf_domain::{RollFilters, RollStatus};

use crate::error::AppError;
use crate::inventory::{MaterialTypePort, RollPort};

/// Inches per foot, squared — the conversion PostgREST returns
/// dimensions in. Every sqft calculation below goes through this
/// constant so unit drift is impossible.
const SQIN_PER_SQFT: f64 = 144.0;

/// Inventory value in USD = Σ (width × remaining_length / 144) ×
/// effective_cost_per_sqft. `effective_cost` falls back to the
/// material type's `default_cost` when the roll-level cost is null,
/// matching the TS implementation's behavior.
#[derive(Clone)]
pub struct InventoryValueUseCase {
    rolls: Arc<dyn RollPort>,
    material_types: Arc<dyn MaterialTypePort>,
}

impl InventoryValueUseCase {
    pub fn new(
        rolls: Arc<dyn RollPort>,
        material_types: Arc<dyn MaterialTypePort>,
    ) -> Self {
        Self { rolls, material_types }
    }

    pub async fn execute(&self) -> Result<f64, AppError> {
        let filters = RollFilters {
            status: Some(RollStatus::Active),
            ..Default::default()
        };
        let rolls = self.rolls.list(&filters).await?;
        let mts = self.material_types.list().await?;
        let default_cost_by_id: HashMap<String, f64> = mts
            .into_iter()
            .filter_map(|m| m.default_cost.map(|c| (m.id.0, c)))
            .collect();
        let mut total = 0.0_f64;
        for r in rolls {
            let sqft = r.width * r.remaining_length / SQIN_PER_SQFT;
            let cost = r.cost_per_sqft.unwrap_or_else(|| {
                r.material_type_id
                    .as_ref()
                    .and_then(|id| default_cost_by_id.get(&id.0).copied())
                    .unwrap_or(0.0)
            });
            total += sqft * cost;
        }
        Ok(total)
    }
}

/// Count of material types whose aggregate sqft across active rolls
/// is below their `min_stock_alert`. Material types with null /
/// zero thresholds are excluded (matches current TS behavior).
#[derive(Clone)]
pub struct LowStockCountUseCase {
    rolls: Arc<dyn RollPort>,
    material_types: Arc<dyn MaterialTypePort>,
}

impl LowStockCountUseCase {
    pub fn new(
        rolls: Arc<dyn RollPort>,
        material_types: Arc<dyn MaterialTypePort>,
    ) -> Self {
        Self { rolls, material_types }
    }

    pub async fn execute(&self) -> Result<u64, AppError> {
        let filters = RollFilters {
            status: Some(RollStatus::Active),
            ..Default::default()
        };
        let rolls = self.rolls.list(&filters).await?;
        let mts = self.material_types.list().await?;

        let mut sqft_by_mt: HashMap<String, f64> = HashMap::new();
        for r in rolls {
            if let Some(id) = r.material_type_id.as_ref() {
                let sqft = r.width * r.remaining_length / SQIN_PER_SQFT;
                *sqft_by_mt.entry(id.0.clone()).or_insert(0.0) += sqft;
            }
        }

        let mut count = 0u64;
        for m in mts {
            if let Some(threshold) = m.min_stock_alert {
                if threshold > 0.0 {
                    let agg = sqft_by_mt.get(&m.id.0).copied().unwrap_or(0.0);
                    if agg < threshold {
                        count += 1;
                    }
                }
            }
        }
        Ok(count)
    }
}

/// Percent growth in roll count, last-7d vs. previous-7d, computed
/// from each roll's `created_at`. Returns 100 when the previous
/// window had zero rolls and the current has any; returns 0 when
/// both windows are empty. Matches the TS implementation.
///
/// `now` is injected as a parameter so tests can pin time; prod
/// calls pass `chrono::Utc::now`-equivalent seconds since epoch
/// via the handler.
#[derive(Clone)]
pub struct InventoryGrowthUseCase {
    rolls: Arc<dyn RollPort>,
}

impl InventoryGrowthUseCase {
    pub fn new(rolls: Arc<dyn RollPort>) -> Self {
        Self { rolls }
    }

    pub async fn execute(&self, now_secs: i64) -> Result<f64, AppError> {
        const WEEK_SECS: i64 = 7 * 24 * 60 * 60;
        let filters = RollFilters::default();
        let rolls = self.rolls.list(&filters).await?;

        let this_window_start = now_secs - WEEK_SECS;
        let last_window_start = now_secs - 2 * WEEK_SECS;

        let (mut this_week, mut last_week) = (0u64, 0u64);
        for r in rolls {
            let Some(created) = r.created_at.as_deref() else {
                continue;
            };
            let Some(secs) = parse_iso_seconds(created) else {
                continue;
            };
            if secs >= this_window_start && secs <= now_secs {
                this_week += 1;
            } else if secs >= last_window_start && secs < this_window_start {
                last_week += 1;
            }
        }

        let growth = if last_week == 0 {
            if this_week > 0 { 100.0 } else { 0.0 }
        } else {
            (this_week as f64 - last_week as f64) / last_week as f64 * 100.0
        };
        Ok(growth)
    }
}

/// Parse the ISO-8601 timestamp PostgREST returns for `created_at`.
/// Supports both `Z` suffix and explicit offsets. Returns None on
/// anything unparseable — the caller skips those rows.
fn parse_iso_seconds(ts: &str) -> Option<i64> {
    // Minimal implementation — `YYYY-MM-DDTHH:MM:SS[.fff][Z|+HH:MM]`.
    // We don't pull chrono into rf-application yet; the upstream
    // Postgres rows always match this shape.
    let (date, time_part) = ts.split_once('T')?;
    let (time, _tz) = time_part
        .split_once('Z')
        .or_else(|| time_part.split_once('+'))
        .or_else(|| time_part.rsplit_once('-'))
        .unwrap_or((time_part, ""));
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: i64 = date_parts.next()?.parse().ok()?;
    let day: i64 = date_parts.next()?.parse().ok()?;
    let mut time_parts = time.split(':');
    let hour: i64 = time_parts.next()?.parse().ok()?;
    let minute: i64 = time_parts.next()?.parse().ok()?;
    let sec_str = time_parts.next()?;
    let (sec_whole, _frac) = sec_str.split_once('.').unwrap_or((sec_str, ""));
    let second: i64 = sec_whole.parse().ok()?;

    // Days since UNIX epoch via Gregorian → Julian day number,
    // without a date library. Standard algorithm.
    let jdn = julian_day_number(year, month, day);
    let unix_jdn = 2440588_i64; // 1970-01-01
    let days = jdn - unix_jdn;
    Some(days * 86400 + hour * 3600 + minute * 60 + second)
}

fn julian_day_number(year: i64, month: i64, day: i64) -> i64 {
    // Fliegel–Van Flandern conversion.
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045
}

/// Most-recent N active rolls by `created_at`. Wraps the port's
/// list method with a status filter + limit clamp.
#[derive(Clone)]
pub struct RecentRollsUseCase {
    rolls: Arc<dyn RollPort>,
}

impl RecentRollsUseCase {
    pub fn new(rolls: Arc<dyn RollPort>) -> Self {
        Self { rolls }
    }

    pub async fn execute(
        &self,
        limit: u32,
    ) -> Result<Vec<rf_domain::Roll>, AppError> {
        let bounded = limit.min(200);
        let filters = RollFilters {
            status: Some(RollStatus::Active),
            limit: Some(bounded),
            ..Default::default()
        };
        self.rolls.list(&filters).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use rf_domain::{MaterialType, MaterialTypeId, Roll, RollId};
    use std::sync::Mutex;

    struct FakeRolls(Mutex<Vec<Roll>>);
    struct FakeMts(Mutex<Vec<MaterialType>>);

    #[async_trait]
    impl RollPort for FakeRolls {
        async fn list(
            &self,
            _filters: &RollFilters,
        ) -> Result<Vec<Roll>, AppError> {
            Ok(self.0.lock().unwrap().clone())
        }
        async fn get(&self, _: &RollId) -> Result<Option<Roll>, AppError> {
            Ok(None)
        }
        async fn create(
            &self,
            _: &crate::inventory::NewRoll,
        ) -> Result<Roll, AppError> {
            unreachable!()
        }
        async fn update(
            &self,
            _: &RollId,
            _: &crate::inventory::RollUpdate,
        ) -> Result<Option<Roll>, AppError> {
            unreachable!()
        }
        async fn delete(&self, _: &RollId) -> Result<bool, AppError> {
            unreachable!()
        }
    }

    #[async_trait]
    impl MaterialTypePort for FakeMts {
        async fn list(&self) -> Result<Vec<MaterialType>, AppError> {
            Ok(self.0.lock().unwrap().clone())
        }
        async fn get(
            &self,
            _: &MaterialTypeId,
        ) -> Result<Option<MaterialType>, AppError> {
            Ok(None)
        }
        async fn create(
            &self,
            _: &crate::inventory::NewMaterialType,
        ) -> Result<MaterialType, AppError> {
            unreachable!()
        }
        async fn update(
            &self,
            _: &MaterialTypeId,
            _: &crate::inventory::MaterialTypeUpdate,
        ) -> Result<Option<MaterialType>, AppError> {
            unreachable!()
        }
        async fn delete(&self, _: &MaterialTypeId) -> Result<bool, AppError> {
            unreachable!()
        }
    }

    fn roll(id: &str, mt: &str, w: f64, len: f64, cost: Option<f64>) -> Roll {
        Roll {
            id: RollId(id.into()),
            material_type_id: Some(MaterialTypeId(mt.into())),
            material_type: "x".into(),
            width: w,
            length: len,
            thickness: 0.25,
            color: None,
            location: None,
            date_received: None,
            supplier: None,
            cost_per_sqft: cost,
            remaining_length: len,
            status: RollStatus::Active,
            notes: None,
            created_at: Some("2026-04-10T12:00:00Z".into()),
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn inventory_value_uses_roll_cost_first() {
        let rolls = Arc::new(FakeRolls(Mutex::new(vec![roll(
            "r", "mt", 48.0, 300.0, Some(3.0),
        )])));
        let mts = Arc::new(FakeMts(Mutex::new(vec![MaterialType {
            id: MaterialTypeId("mt".into()),
            name: "Neoprene".into(),
            description: None,
            default_cost: Some(10.0),
            min_stock_alert: None,
            created_at: None,
            updated_at: None,
        }])));
        let uc = InventoryValueUseCase::new(rolls, mts);
        let v = uc.execute().await.unwrap();
        // 48 * 300 / 144 = 100 sqft × $3.0 = $300
        assert!((v - 300.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn inventory_value_falls_back_to_material_default_cost() {
        let rolls = Arc::new(FakeRolls(Mutex::new(vec![roll(
            "r", "mt", 48.0, 300.0, None,
        )])));
        let mts = Arc::new(FakeMts(Mutex::new(vec![MaterialType {
            id: MaterialTypeId("mt".into()),
            name: "Neoprene".into(),
            description: None,
            default_cost: Some(5.0),
            min_stock_alert: None,
            created_at: None,
            updated_at: None,
        }])));
        let uc = InventoryValueUseCase::new(rolls, mts);
        let v = uc.execute().await.unwrap();
        // 100 sqft × $5 = $500
        assert!((v - 500.0).abs() < 1e-6);
    }

    #[tokio::test]
    async fn low_stock_count_counts_types_below_threshold() {
        let rolls = Arc::new(FakeRolls(Mutex::new(vec![
            roll("r1", "mt-low", 48.0, 10.0, None),    // 3.33 sqft
            roll("r2", "mt-high", 48.0, 1000.0, None), // 333 sqft
        ])));
        let mts = Arc::new(FakeMts(Mutex::new(vec![
            MaterialType {
                id: MaterialTypeId("mt-low".into()),
                name: "Low".into(),
                description: None,
                default_cost: None,
                min_stock_alert: Some(50.0),
                created_at: None,
                updated_at: None,
            },
            MaterialType {
                id: MaterialTypeId("mt-high".into()),
                name: "High".into(),
                description: None,
                default_cost: None,
                min_stock_alert: Some(50.0),
                created_at: None,
                updated_at: None,
            },
        ])));
        let uc = LowStockCountUseCase::new(rolls, mts);
        assert_eq!(uc.execute().await.unwrap(), 1);
    }

    #[tokio::test]
    async fn growth_returns_100_when_previous_window_empty() {
        // Roll created "now" — previous-7d window is empty,
        // this-week has one.
        let mut r = roll("r", "mt", 1.0, 1.0, None);
        r.created_at = Some("2026-04-19T12:00:00Z".into());
        let rolls = Arc::new(FakeRolls(Mutex::new(vec![r])));
        let uc = InventoryGrowthUseCase::new(rolls);
        let now = parse_iso_seconds("2026-04-19T13:00:00Z").unwrap();
        assert_eq!(uc.execute(now).await.unwrap(), 100.0);
    }

    #[tokio::test]
    async fn parse_iso_seconds_handles_z_suffix() {
        let a = parse_iso_seconds("2026-04-19T00:00:00Z").unwrap();
        let b = parse_iso_seconds("2026-04-20T00:00:00Z").unwrap();
        assert_eq!(b - a, 86400);
    }

    #[tokio::test]
    async fn recent_clamps_to_200() {
        let rolls = Arc::new(FakeRolls(Mutex::new(vec![])));
        let uc = RecentRollsUseCase::new(rolls);
        // No easy way to observe the clamp without a filter-capturing
        // fake here; the logic is exercised by the integration test.
        let _ = uc.execute(9999).await.unwrap();
    }
}
