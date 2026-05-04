//! Reorder suggestion generator (S3c Task 6).
//!
//! Ports the TS `GenerateReorderSuggestionsUseCase` with the full
//! contract: stock / threshold / reorder_quantity / urgency /
//! days_until_stockout / estimated_cost / supplier_id / supplier_name /
//! pending_quantity_sqft / has_pending_po.
//!
//! Key behaviors (plan §"Reorder suggestion contract"):
//!
//! - **Pending-PO suppression:** rules with at least one non-draft
//!   PO line item for their material are excluded by default; the
//!   handler passes `include_pending=true` to opt in.
//! - **Supplier resolution:** prefer `rule.supplier_id`; else the
//!   `material_suppliers` row with `preferred_supplier=true`; else
//!   the first active `material_suppliers` row; else null.
//! - **Urgency normalization:** the calc ladder uses
//!   critical/high/normal/low; the UI wants critical/high/medium/low.
//!   Map `normal → medium` once, here, at the use-case boundary.
//! - **Suppression of zero-quantity suggestions:** if
//!   `suggested_after_pending <= 0`, drop the rule from the output
//!   (matches TS).

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{MaterialTypeId, ReorderRule, ReorderSuggestion, SupplierId, Urgency};

use crate::error::AppError;
use crate::procurement::reorder_rules::ReorderRulePort;

/// Per-supplier quote for a material — what the calc engine needs to
/// estimate the PO cost. Narrower than `MaterialSupplier` because
/// the calc only cares about `supplier_id`, `supplier_name`,
/// `cost_per_sqft`, and `preferred_supplier`.
#[derive(Debug, Clone)]
pub struct MaterialSupplierQuote {
    pub supplier_id: SupplierId,
    pub supplier_name: Option<String>,
    pub cost_per_sqft: f64,
    pub preferred: bool,
}

/// Read-side port for the suggestion generator. Split from
/// `ReorderRulePort` because the concerns are different: this port
/// is read-only and spans multiple tables (`rolls`, `cuts`,
/// `purchase_order_items`, `material_suppliers`, `material_types`).
///
/// Adapters compose the reads in whichever shape PostgREST supports
/// efficiently; the use case only cares about the shape below.
#[async_trait]
pub trait SuggestionReadsPort: Send + Sync {
    /// Σ ((width * remaining_length) / 144) for active rolls of the
    /// material type. The TS service computes this per rule; the
    /// port accepts a slice of ids so adapters can batch the query.
    async fn current_stock_sqft(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, f64>, AppError>;

    /// Sum of cuts.total_sqft_used over the last 90 days, divided
    /// by 90 — system-wide average, NOT per-material. Scalar.
    async fn average_daily_usage_sqft(&self) -> Result<f64, AppError>;

    /// Sum of purchase_order_items.quantity_sqft across items whose
    /// parent PO is NOT in `draft` — per material. Used to subtract
    /// "already on order" stock from the suggestion + drive
    /// `has_pending_po`.
    async fn pending_quantities_sqft(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, f64>, AppError>;

    /// Per-material supplier quotes, returned all at once so the
    /// resolver can pick preferred / active without per-rule
    /// round-trips.
    async fn material_supplier_quotes(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, Vec<MaterialSupplierQuote>>, AppError>;

    /// `default_cost` + `name` from the `material_types` row —
    /// material_name for the DTO and fallback cost when no
    /// material_suppliers row exists.
    async fn material_type_facts(
        &self,
        ids: &[MaterialTypeId],
    ) -> Result<HashMap<MaterialTypeId, (String, Option<f64>)>, AppError>;

    /// Resolve a supplier id back to a display name. Used only when
    /// a rule explicitly pins a supplier that doesn't also appear
    /// in `material_supplier_quotes` (rare, but possible if the
    /// material-supplier link was deleted after the rule was set).
    async fn supplier_name(&self, id: &SupplierId) -> Result<Option<String>, AppError>;
}

/// Options for the suggestion generator. `include_pending` is the
/// only knob today; future: include_inactive, material filter, etc.
#[derive(Debug, Clone, Copy, Default)]
pub struct SuggestionOptions {
    pub include_pending: bool,
}

/// Urgency ladder — identical to the TS `determineUrgency` function.
/// Returned as the calc's native tiers (critical / high / normal /
/// low); normalization to the UI-facing variant (normal → medium)
/// happens one layer up.
fn determine_urgency(current_stock: f64, reorder_point: f64) -> &'static str {
    if current_stock <= 0.0 {
        return "critical";
    }
    if reorder_point <= 0.0 {
        // Guard against div-by-zero — matches TS behavior where a
        // rule with reorder_point=0 never triggers but should also
        // not crash the calc. Fall through to "low".
        return "low";
    }
    let ratio = current_stock / reorder_point;
    if ratio <= 0.25 {
        "high"
    } else if ratio <= 0.5 {
        "normal"
    } else {
        "low"
    }
}

fn normalize_urgency(tier: &str) -> Urgency {
    match tier {
        "critical" => Urgency::Critical,
        "high" => Urgency::High,
        // TS normalizes "normal" → "medium" for the UI. The domain's
        // `Urgency` enum only exposes the UI-facing variants, so
        // the mapping lives here.
        "normal" | "medium" => Urgency::Medium,
        _ => Urgency::Low,
    }
}

/// Economic-order-quantity floor, ported from the TS
/// `calculateOptimalOrderQuantity`:
///
///   eoq = sqrt((2 × annual_demand × ordering_cost) / holding_cost)
///
/// with `ordering_cost = 50`, `holding_cost = unit_cost × 0.25`,
/// `annual_demand = avg_daily_usage × 365`. The TS service then
/// rounds to the nearest 100 sqft and clamps to a minimum of 100.
/// Returns `None` when either input is zero (no usage data or no
/// price on file); the TS fallback is to drop the EOQ floor from
/// the `max()` expression, which means the base quantity wins.
fn optimal_order_quantity(avg_daily_usage: f64, unit_cost: f64) -> Option<f64> {
    if avg_daily_usage <= 0.0 || unit_cost <= 0.0 {
        return None;
    }
    let annual_demand = avg_daily_usage * 365.0;
    let holding_cost = unit_cost * 0.25;
    let ordering_cost = 50.0;
    let eoq = ((2.0 * annual_demand * ordering_cost) / holding_cost).sqrt();
    // Round to nearest 100, clamp to 100 minimum — TS behavior.
    Some(((eoq / 100.0).round() * 100.0).max(100.0))
}

/// Mirrors `calculateSuggestedQuantity` from the TS service:
/// 1. Base quantity = `max(rule.reorder_quantity, eoq_optimal)`.
///    The EOQ floor keeps batch economics sensible for high-usage
///    materials; `rule.reorder_quantity` is the floor operators set.
///    When EOQ can't be computed (zero usage or zero unit cost),
///    the TS service falls back to `rule.reorder_quantity` — which
///    is what a `None` from `optimal_order_quantity` produces here.
/// 2. If stock is critically low (≤ 25% of reorder_point), bump by
///    1.5×.
/// 3. If max_stock_level is set and current+suggested would exceed
///    it, cap at `max_stock_level - current_stock` (min 0).
/// 4. Round to the nearest 10 sqft.
fn suggested_quantity(
    current_stock: f64,
    reorder_point: f64,
    reorder_quantity: f64,
    max_stock: Option<f64>,
    avg_daily_usage: f64,
    unit_cost: f64,
) -> f64 {
    let base = match optimal_order_quantity(avg_daily_usage, unit_cost) {
        Some(eoq) => reorder_quantity.max(eoq),
        None => reorder_quantity,
    };
    let mut suggested = base;
    if reorder_point > 0.0 && current_stock <= reorder_point * 0.25 {
        suggested = base * 1.5;
    }
    if let Some(max) = max_stock {
        if current_stock + suggested > max {
            suggested = (max - current_stock).max(0.0);
        }
    }
    (suggested / 10.0).round() * 10.0
}

/// Resolver for the material→supplier association. Pins explicitly
/// if the rule has one; otherwise walks the quote list for a
/// preferred supplier, then falls through to the first active
/// quote; returns None if no usable quote exists.
fn resolve_supplier(
    rule: &ReorderRule,
    quotes: &[MaterialSupplierQuote],
) -> Option<(SupplierId, Option<String>)> {
    if let Some(explicit) = rule.supplier_id.as_ref() {
        // If the rule's supplier happens to be in the quotes list,
        // reuse its name so the caller doesn't need a round-trip
        // for the display label.
        if let Some(q) = quotes.iter().find(|q| q.supplier_id == *explicit) {
            return Some((q.supplier_id.clone(), q.supplier_name.clone()));
        }
        return Some((explicit.clone(), None));
    }
    let preferred = quotes.iter().find(|q| q.preferred);
    let picked = preferred.or_else(|| quotes.first())?;
    Some((picked.supplier_id.clone(), picked.supplier_name.clone()))
}

/// Cost-per-sqft resolver. Precedence:
///
/// 1. If a specific supplier is pinned (either by the rule or
///    resolved upstream), use that supplier's quote when one
///    exists. If NO quote exists for the pinned supplier, fall
///    straight through to `material_default` — using another
///    supplier's quote would mis-match the DTO's `supplier_id`
///    against the cost used to compute `estimated_cost`.
/// 2. Otherwise, prefer the preferred quote.
/// 3. Otherwise, the first active quote.
/// 4. Otherwise, `material_default`, then the TS sentinel of $10.
fn cost_per_sqft(
    supplier_id: Option<&SupplierId>,
    quotes: &[MaterialSupplierQuote],
    material_default: Option<f64>,
) -> f64 {
    if let Some(sid) = supplier_id {
        if let Some(q) = quotes.iter().find(|q| q.supplier_id == *sid) {
            return q.cost_per_sqft;
        }
        // Pinned supplier with no quote — DO NOT substitute
        // another supplier's rate; that would return supplier X in
        // the DTO while estimating cost from supplier Y's quote.
        return material_default.unwrap_or(10.0);
    }
    if let Some(q) = quotes.iter().find(|q| q.preferred) {
        return q.cost_per_sqft;
    }
    if let Some(q) = quotes.first() {
        return q.cost_per_sqft;
    }
    material_default.unwrap_or(10.0)
}

/// Days until stockout, given current stock and system-wide daily
/// usage. Returns `Some(0)` (not `None`) when avg daily usage is
/// zero — matches the TS `GenerateReorderSuggestionsUseCase`,
/// which evaluates `avgDailyUsage > 0 ? floor(current/avgDailyUsage) : 0`
/// and ships a concrete 0 on the wire. A migration to Option-on-
/// absence would be a client-observable shape change.
fn days_until_stockout(current_stock: f64, avg_daily: f64) -> Option<i32> {
    if avg_daily <= 0.0 {
        return Some(0);
    }
    let days = (current_stock / avg_daily).floor();
    Some(days.max(0.0) as i32)
}

#[derive(Clone)]
pub struct GenerateReorderSuggestionsUseCase {
    rules: Arc<dyn ReorderRulePort>,
    reads: Arc<dyn SuggestionReadsPort>,
}

impl GenerateReorderSuggestionsUseCase {
    pub fn new(rules: Arc<dyn ReorderRulePort>, reads: Arc<dyn SuggestionReadsPort>) -> Self {
        Self { rules, reads }
    }

    pub async fn execute(
        &self,
        opts: SuggestionOptions,
    ) -> Result<Vec<ReorderSuggestion>, AppError> {
        let rules = self.rules.list().await?;
        // Filter out inactive rules early so we don't waste a read
        // on stock / pending / quotes for materials nobody asked to
        // reorder.
        let active: Vec<&ReorderRule> = rules.iter().filter(|r| r.active).collect();
        if active.is_empty() {
            return Ok(Vec::new());
        }

        let ids: Vec<MaterialTypeId> = active.iter().map(|r| r.material_type_id.clone()).collect();

        let stock = self.reads.current_stock_sqft(&ids).await?;
        let avg_daily = self.reads.average_daily_usage_sqft().await?;
        let pending = self.reads.pending_quantities_sqft(&ids).await?;
        let quotes = self.reads.material_supplier_quotes(&ids).await?;
        let facts = self.reads.material_type_facts(&ids).await?;

        let mut out: Vec<ReorderSuggestion> = Vec::with_capacity(active.len());
        for rule in active {
            let current = stock.get(&rule.material_type_id).copied().unwrap_or(0.0);
            let pending_qty = pending.get(&rule.material_type_id).copied().unwrap_or(0.0);
            let has_pending = pending_qty > 0.0;
            if has_pending && !opts.include_pending {
                // Suppressed by default — operator opts in with
                // ?include_pending=true to see rules that already
                // have non-draft POs on them.
                continue;
            }
            // Don't trigger if stock + pending is above the reorder
            // point (matches TS).
            if current + pending_qty > rule.reorder_point {
                continue;
            }

            // Resolve supplier + unit cost FIRST so the EOQ floor
            // inside `suggested_quantity` can see the real price.
            // The TS `calculateOptimalOrderQuantity` reads
            // `material_suppliers.cost_per_sqft` for the supplier
            // and falls back to a $10 sentinel when none exists;
            // `cost_per_sqft` below implements the same ladder.
            let qs = quotes
                .get(&rule.material_type_id)
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            let supplier = resolve_supplier(rule, qs);
            let (supplier_id, supplier_name) = match supplier {
                Some((id, Some(name))) => (Some(id), Some(name)),
                Some((id, None)) => {
                    // Explicit rule supplier that isn't in the
                    // quotes list — look up its display name.
                    let name = self.reads.supplier_name(&id).await?;
                    (Some(id), name)
                }
                None => (None, None),
            };

            let (material_name, default_cost) = facts
                .get(&rule.material_type_id)
                .cloned()
                .unwrap_or_else(|| ("Unknown".to_string(), None));
            let per_sqft = cost_per_sqft(supplier_id.as_ref(), qs, default_cost);

            let base_suggested = suggested_quantity(
                current,
                rule.reorder_point,
                rule.reorder_quantity,
                rule.max_stock_level,
                avg_daily,
                per_sqft,
            );
            let adjusted = (base_suggested - pending_qty).max(0.0);
            if adjusted <= 0.0 {
                continue;
            }

            let estimated = adjusted * per_sqft;

            let tier = determine_urgency(current, rule.reorder_point);
            let urgency = normalize_urgency(tier);

            out.push(ReorderSuggestion {
                rule_id: rule.id.clone(),
                material_type_id: rule.material_type_id.clone(),
                material_name,
                current_stock_sqft: current,
                threshold_sqft: rule.reorder_point,
                reorder_quantity_sqft: adjusted,
                urgency,
                days_until_stockout: days_until_stockout(current, avg_daily),
                estimated_cost: Some(estimated),
                supplier_id,
                supplier_name,
                pending_quantity_sqft: pending_qty,
                has_pending_po: has_pending,
            });
        }

        // Sort by days_until_stockout ascending (most urgent first).
        // Nones go last. Matches TS sort.
        out.sort_by(
            |a, b| match (a.days_until_stockout, b.days_until_stockout) {
                (Some(x), Some(y)) => x.cmp(&y),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            },
        );
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rf_domain::ReorderRuleId;
    use std::sync::Mutex;

    // ---------- determine_urgency / suggested_quantity ----------

    #[test]
    fn urgency_tiers_match_ts_ladder() {
        assert_eq!(determine_urgency(0.0, 500.0), "critical");
        assert_eq!(determine_urgency(100.0, 500.0), "high"); // 0.20
        assert_eq!(determine_urgency(125.0, 500.0), "high"); // 0.25
        assert_eq!(determine_urgency(200.0, 500.0), "normal"); // 0.40
        assert_eq!(determine_urgency(250.0, 500.0), "normal"); // 0.50
        assert_eq!(determine_urgency(300.0, 500.0), "low");
    }

    #[test]
    fn urgency_guards_div_by_zero_reorder_point() {
        // stock > 0, reorder_point == 0 → low (not a panic).
        assert_eq!(determine_urgency(100.0, 0.0), "low");
    }

    // `avg_daily=0, unit_cost=0` disables the EOQ floor so these
    // focused tests exercise the base behavior in isolation (matches
    // the TS fallback when neither `average_daily_usage` nor
    // `material_suppliers.cost_per_sqft` is on file).
    #[test]
    fn suggested_quantity_applies_15x_on_critical_stock() {
        // current < 25% of reorder_point → 1.5× quantity, rounded
        // to nearest 10.
        let q = suggested_quantity(100.0, 500.0, 1000.0, None, 0.0, 0.0);
        assert_eq!(q, 1500.0);
    }

    #[test]
    fn suggested_quantity_caps_at_max_stock() {
        // current 400 + reorder_quantity 1000 = 1400 > max 1200
        // → cap at 1200 - 400 = 800.
        let q = suggested_quantity(400.0, 500.0, 1000.0, Some(1200.0), 0.0, 0.0);
        assert_eq!(q, 800.0);
    }

    #[test]
    fn suggested_quantity_rounds_to_ten() {
        let q = suggested_quantity(400.0, 500.0, 1017.0, None, 0.0, 0.0);
        assert_eq!(q, 1020.0);
    }

    #[test]
    fn eoq_floor_raises_base_when_demand_is_high() {
        // EOQ = sqrt((2 * 100*365 * 50) / (10 * 0.25))
        //     = sqrt(73000 * 50 / 2.5)
        //     = sqrt(1_460_000) ≈ 1208.3
        // Rounded to nearest 100 → 1200. Rule quantity 500 loses to
        // 1200; 1200 wins as the base. No critical-stock bump
        // (stock 400 > 0.25 * 500 = 125).
        let q = suggested_quantity(400.0, 500.0, 500.0, None, 100.0, 10.0);
        assert_eq!(q, 1200.0);
    }

    #[test]
    fn eoq_clamps_to_100_minimum() {
        // Tiny demand + very expensive unit → computed EOQ rounds
        // to 0; TS clamps at 100 so we never recommend a near-zero
        // lot. Verify the same floor here.
        let eoq = optimal_order_quantity(0.001, 10_000.0);
        assert_eq!(eoq, Some(100.0));
    }

    #[test]
    fn eoq_skips_when_usage_or_cost_zero() {
        assert_eq!(optimal_order_quantity(0.0, 10.0), None);
        assert_eq!(optimal_order_quantity(10.0, 0.0), None);
    }

    #[test]
    fn days_until_stockout_returns_zero_for_zero_usage() {
        // TS parity: avg_daily == 0 ships `0` on the wire, not null.
        assert_eq!(days_until_stockout(1000.0, 0.0), Some(0));
    }

    #[test]
    fn days_until_stockout_clamps_at_zero() {
        // Negative stock shouldn't produce a negative day count.
        assert_eq!(days_until_stockout(-5.0, 10.0), Some(0));
    }

    // ---------- resolve_supplier ----------

    fn quote(sup: &str, cost: f64, preferred: bool) -> MaterialSupplierQuote {
        MaterialSupplierQuote {
            supplier_id: SupplierId(sup.into()),
            supplier_name: Some(format!("Supplier {sup}")),
            cost_per_sqft: cost,
            preferred,
        }
    }

    fn rule_with_supplier(mt: &str, sup: Option<&str>) -> ReorderRule {
        ReorderRule {
            id: ReorderRuleId("rr-1".into()),
            material_type_id: MaterialTypeId(mt.into()),
            supplier_id: sup.map(|s| SupplierId(s.into())),
            reorder_point: 500.0,
            reorder_quantity: 1000.0,
            max_stock_level: None,
            lead_time_days: 7,
            safety_stock_days: None,
            auto_reorder: false,
            active: true,
            notes: None,
            last_triggered_at: None,
            created_at: None,
            updated_at: None,
            material_type: None,
            supplier: None,
        }
    }

    #[test]
    fn supplier_resolution_prefers_rule_supplier() {
        let rule = rule_with_supplier("mt-1", Some("sup-a"));
        let quotes = [quote("sup-b", 5.0, true)];
        let (id, _) = resolve_supplier(&rule, &quotes).unwrap();
        assert_eq!(id.0, "sup-a");
    }

    #[test]
    fn supplier_resolution_falls_through_to_preferred() {
        let rule = rule_with_supplier("mt-1", None);
        let quotes = [quote("sup-a", 10.0, false), quote("sup-b", 5.0, true)];
        let (id, _) = resolve_supplier(&rule, &quotes).unwrap();
        assert_eq!(id.0, "sup-b");
    }

    #[test]
    fn supplier_resolution_falls_through_to_first_active() {
        let rule = rule_with_supplier("mt-1", None);
        let quotes = [quote("sup-a", 10.0, false)];
        let (id, _) = resolve_supplier(&rule, &quotes).unwrap();
        assert_eq!(id.0, "sup-a");
    }

    #[test]
    fn supplier_resolution_returns_none_when_no_quotes() {
        let rule = rule_with_supplier("mt-1", None);
        assert!(resolve_supplier(&rule, &[]).is_none());
    }

    #[test]
    fn cost_pinned_supplier_without_quote_uses_default() {
        // Rule pins supplier X; only supplier Y has a quote. The
        // resolver must NOT use Y's cost — that would mis-match
        // estimated_cost against supplier_id in the DTO. Falls
        // through to material default instead.
        let sid = SupplierId("sup-x".into());
        let quotes = [quote("sup-y", 99.0, true)];
        let cost = cost_per_sqft(Some(&sid), &quotes, Some(7.5));
        assert_eq!(cost, 7.5);
    }

    #[test]
    fn cost_pinned_supplier_without_quote_and_no_default_uses_sentinel() {
        let sid = SupplierId("sup-x".into());
        let quotes = [quote("sup-y", 99.0, true)];
        let cost = cost_per_sqft(Some(&sid), &quotes, None);
        assert_eq!(cost, 10.0); // TS sentinel
    }

    // ---------- end-to-end use case ----------

    #[derive(Default)]
    struct FakeReads {
        stock: Mutex<HashMap<MaterialTypeId, f64>>,
        pending: Mutex<HashMap<MaterialTypeId, f64>>,
        quotes: Mutex<HashMap<MaterialTypeId, Vec<MaterialSupplierQuote>>>,
        facts: Mutex<HashMap<MaterialTypeId, (String, Option<f64>)>>,
        avg_daily: Mutex<f64>,
    }

    #[async_trait]
    impl SuggestionReadsPort for FakeReads {
        async fn current_stock_sqft(
            &self,
            ids: &[MaterialTypeId],
        ) -> Result<HashMap<MaterialTypeId, f64>, AppError> {
            let guard = self.stock.lock().unwrap();
            Ok(ids
                .iter()
                .filter_map(|id| guard.get(id).map(|v| (id.clone(), *v)))
                .collect())
        }
        async fn average_daily_usage_sqft(&self) -> Result<f64, AppError> {
            Ok(*self.avg_daily.lock().unwrap())
        }
        async fn pending_quantities_sqft(
            &self,
            ids: &[MaterialTypeId],
        ) -> Result<HashMap<MaterialTypeId, f64>, AppError> {
            let guard = self.pending.lock().unwrap();
            Ok(ids
                .iter()
                .filter_map(|id| guard.get(id).map(|v| (id.clone(), *v)))
                .collect())
        }
        async fn material_supplier_quotes(
            &self,
            ids: &[MaterialTypeId],
        ) -> Result<HashMap<MaterialTypeId, Vec<MaterialSupplierQuote>>, AppError> {
            let guard = self.quotes.lock().unwrap();
            Ok(ids
                .iter()
                .filter_map(|id| guard.get(id).map(|v| (id.clone(), v.clone())))
                .collect())
        }
        async fn material_type_facts(
            &self,
            ids: &[MaterialTypeId],
        ) -> Result<HashMap<MaterialTypeId, (String, Option<f64>)>, AppError> {
            let guard = self.facts.lock().unwrap();
            Ok(ids
                .iter()
                .filter_map(|id| guard.get(id).map(|v| (id.clone(), v.clone())))
                .collect())
        }
        async fn supplier_name(&self, _id: &SupplierId) -> Result<Option<String>, AppError> {
            Ok(None)
        }
    }

    #[derive(Default)]
    struct FakeRules {
        rows: Mutex<Vec<ReorderRule>>,
    }

    #[async_trait]
    impl ReorderRulePort for FakeRules {
        async fn list(&self) -> Result<Vec<ReorderRule>, AppError> {
            Ok(self.rows.lock().unwrap().clone())
        }
        async fn get(&self, _: &ReorderRuleId) -> Result<Option<ReorderRule>, AppError> {
            Ok(None)
        }
        async fn create(
            &self,
            _: &crate::procurement::NewReorderRule,
        ) -> Result<ReorderRule, AppError> {
            unreachable!()
        }
        async fn update(
            &self,
            _: &ReorderRuleId,
            _: &crate::procurement::ReorderRuleUpdate,
        ) -> Result<Option<ReorderRule>, AppError> {
            unreachable!()
        }
        async fn touch_triggered_at(&self, _: &ReorderRuleId) -> Result<(), AppError> {
            Ok(())
        }
        async fn delete(&self, _: &ReorderRuleId) -> Result<bool, AppError> {
            unreachable!()
        }
    }

    #[tokio::test]
    async fn suggestion_includes_full_contract_fields() {
        let rules = Arc::new(FakeRules::default());
        let rule = ReorderRule {
            id: ReorderRuleId("rr-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            supplier_id: None,
            reorder_point: 500.0,
            reorder_quantity: 1000.0,
            max_stock_level: None,
            lead_time_days: 7,
            safety_stock_days: None,
            auto_reorder: false,
            active: true,
            notes: None,
            last_triggered_at: None,
            created_at: None,
            updated_at: None,
            material_type: None,
            supplier: None,
        };
        rules.rows.lock().unwrap().push(rule);

        let reads = Arc::new(FakeReads::default());
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 100.0);
        *reads.avg_daily.lock().unwrap() = 10.0;
        reads.quotes.lock().unwrap().insert(
            MaterialTypeId("mt-1".into()),
            vec![quote("sup-1", 5.0, true)],
        );
        reads.facts.lock().unwrap().insert(
            MaterialTypeId("mt-1".into()),
            ("Neoprene".to_string(), Some(4.0)),
        );

        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc.execute(SuggestionOptions::default()).await.unwrap();
        assert_eq!(out.len(), 1);
        let s = &out[0];
        assert_eq!(s.material_name, "Neoprene");
        assert_eq!(s.current_stock_sqft, 100.0);
        assert_eq!(s.threshold_sqft, 500.0);
        // 1.5× bump, round to 10.
        assert_eq!(s.reorder_quantity_sqft, 1500.0);
        assert_eq!(s.urgency, Urgency::High);
        assert_eq!(s.days_until_stockout, Some(10));
        assert_eq!(s.supplier_id, Some(SupplierId("sup-1".into())));
        assert_eq!(s.supplier_name, Some("Supplier sup-1".into()));
        // 1500 * 5.0 (preferred quote) = 7500
        assert_eq!(s.estimated_cost, Some(7500.0));
        assert!(!s.has_pending_po);
    }

    #[tokio::test]
    async fn pending_po_suppresses_rule_by_default() {
        let rules = Arc::new(FakeRules::default());
        rules
            .rows
            .lock()
            .unwrap()
            .push(rule_with_supplier("mt-1", None));

        let reads = Arc::new(FakeReads::default());
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 50.0);
        reads
            .pending
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 200.0);
        reads.facts.lock().unwrap().insert(
            MaterialTypeId("mt-1".into()),
            ("Neoprene".to_string(), Some(4.0)),
        );
        *reads.avg_daily.lock().unwrap() = 10.0;

        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc.execute(SuggestionOptions::default()).await.unwrap();
        assert!(out.is_empty(), "pending PO should suppress by default");
    }

    #[tokio::test]
    async fn include_pending_opt_in_shows_suppressed_rule() {
        let rules = Arc::new(FakeRules::default());
        rules
            .rows
            .lock()
            .unwrap()
            .push(rule_with_supplier("mt-1", None));

        let reads = Arc::new(FakeReads::default());
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 50.0);
        reads
            .pending
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 200.0);
        reads.facts.lock().unwrap().insert(
            MaterialTypeId("mt-1".into()),
            ("Neoprene".to_string(), Some(4.0)),
        );
        *reads.avg_daily.lock().unwrap() = 10.0;

        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc
            .execute(SuggestionOptions {
                include_pending: true,
            })
            .await
            .unwrap();
        assert_eq!(out.len(), 1);
        assert!(out[0].has_pending_po);
        assert_eq!(out[0].pending_quantity_sqft, 200.0);
    }

    #[tokio::test]
    async fn above_reorder_point_is_not_suggested() {
        let rules = Arc::new(FakeRules::default());
        rules
            .rows
            .lock()
            .unwrap()
            .push(rule_with_supplier("mt-1", None));

        let reads = Arc::new(FakeReads::default());
        // Stock 600 > reorder_point 500 → no trigger.
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 600.0);
        reads.facts.lock().unwrap().insert(
            MaterialTypeId("mt-1".into()),
            ("Neoprene".to_string(), None),
        );

        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc.execute(SuggestionOptions::default()).await.unwrap();
        assert!(out.is_empty());
    }

    #[tokio::test]
    async fn inactive_rules_are_skipped() {
        let rules = Arc::new(FakeRules::default());
        let mut r = rule_with_supplier("mt-1", None);
        r.active = false;
        rules.rows.lock().unwrap().push(r);

        let reads = Arc::new(FakeReads::default());
        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc.execute(SuggestionOptions::default()).await.unwrap();
        assert!(out.is_empty());
    }

    #[tokio::test]
    async fn sorts_by_urgency_days_until_stockout_ascending() {
        let rules = Arc::new(FakeRules::default());
        {
            let mut guard = rules.rows.lock().unwrap();
            let mut r1 = rule_with_supplier("mt-1", None);
            r1.id = ReorderRuleId("rr-1".into());
            let mut r2 = rule_with_supplier("mt-2", None);
            r2.id = ReorderRuleId("rr-2".into());
            guard.push(r1);
            guard.push(r2);
        }

        let reads = Arc::new(FakeReads::default());
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), 100.0);
        reads
            .stock
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-2".into()), 50.0);
        reads
            .facts
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-1".into()), ("A".to_string(), Some(1.0)));
        reads
            .facts
            .lock()
            .unwrap()
            .insert(MaterialTypeId("mt-2".into()), ("B".to_string(), Some(1.0)));
        *reads.avg_daily.lock().unwrap() = 10.0;

        let uc = GenerateReorderSuggestionsUseCase::new(rules, reads);
        let out = uc.execute(SuggestionOptions::default()).await.unwrap();
        assert_eq!(out.len(), 2);
        // mt-2 has 5 days left, mt-1 has 10 — mt-2 should come first.
        assert_eq!(out[0].material_type_id.0, "mt-2");
        assert_eq!(out[1].material_type_id.0, "mt-1");
    }
}
