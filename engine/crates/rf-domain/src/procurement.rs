//! Procurement aggregates — purchase orders, purchase-order items,
//! reorder rules, reorder suggestions, and the CSV-import row shape.
//!
//! Each struct mirrors the underlying Supabase schema 1:1, same as
//! [`crate::inventory`]. Nullable DB columns map to `Option<T>`.
//! Identifiers are UUID strings; validation (UUID well-formedness,
//! non-empty names, non-negative amounts) lives at the use-case or
//! API boundary — not here. Keeps this crate zero-dep beyond serde.
//!
//! Schema references:
//! - `src/infrastructure/supabase/migrations/20240219000004_create_reorder_rules_table.sql`
//! - `src/infrastructure/supabase/migrations/20240219000005_create_purchase_orders_table.sql`
//! - `src/infrastructure/supabase/migrations/20240219000006_create_purchase_order_items_table.sql`

use serde::{Deserialize, Serialize};

use crate::inventory::{MaterialType, MaterialTypeId, Supplier, SupplierId};

/// Newtype for `purchase_orders.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PurchaseOrderId(pub String);

/// Newtype for `purchase_order_items.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PurchaseOrderItemId(pub String);

/// Newtype for `reorder_rules.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ReorderRuleId(pub String);

/// PO workflow status.
///
/// Matches the DB CHECK constraint on `purchase_orders.status`.
///
/// Transitions (enforced in the `UpdateStatus` use case):
/// ```text
/// draft     → { pending, cancelled }
/// pending   → { approved, draft, cancelled }
/// approved  → { ordered, cancelled }
/// ordered   → { cancelled }            # NOT received
/// received  → { }                      # terminal; RLS blocks
/// cancelled → { draft }
/// ```
///
/// `received` is intentionally unreachable via the generic status-
/// update path — the `/api/v2/po/{id}/receive` endpoint is the only
/// writer, which also creates rolls + stamps `actual_delivery_date`
/// atomically. See S3c plan §"PO status state machine".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PurchaseOrderStatus {
    Draft,
    Pending,
    Approved,
    Ordered,
    Received,
    Cancelled,
}

impl PurchaseOrderStatus {
    /// Targets reachable via the generic status-update path.
    /// **Excludes `Received`** — that is receive-flow only.
    pub fn allowed_targets_from(self) -> &'static [PurchaseOrderStatus] {
        use PurchaseOrderStatus::*;
        match self {
            Draft => &[Pending, Cancelled],
            Pending => &[Approved, Draft, Cancelled],
            Approved => &[Ordered, Cancelled],
            Ordered => &[Cancelled],
            Received => &[],
            Cancelled => &[Draft],
        }
    }

    pub fn as_str(self) -> &'static str {
        use PurchaseOrderStatus::*;
        match self {
            Draft => "draft",
            Pending => "pending",
            Approved => "approved",
            Ordered => "ordered",
            Received => "received",
            Cancelled => "cancelled",
        }
    }
}

/// One row from `purchase_orders`. Totals (`subtotal`, `total_amount`)
/// are populated by the `trigger_update_purchase_order_totals` DB
/// trigger; we write raw columns and read back via PostgREST's
/// `Prefer: return=representation`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseOrder {
    pub id: PurchaseOrderId,
    pub po_number: String,
    pub supplier_id: SupplierId,
    pub status: PurchaseOrderStatus,
    /// ISO-8601 date (YYYY-MM-DD). Stamped when status transitions
    /// to `ordered`.
    pub order_date: Option<String>,
    pub requested_delivery_date: Option<String>,
    /// Stamped by the receive flow when all items fully received.
    pub actual_delivery_date: Option<String>,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub shipping_cost: f64,
    pub total_amount: f64,
    pub payment_terms: Option<String>,
    pub shipping_address: Option<String>,
    pub billing_address: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub approved_by: Option<String>,
    pub approved_at: Option<String>,
    pub auto_generated: bool,
    pub reorder_rule_id: Option<ReorderRuleId>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// One row from `purchase_order_items`. `line_total` is populated by
/// the `trigger_calculate_po_item_line_total` DB trigger — Rust never
/// writes it explicitly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseOrderItem {
    pub id: PurchaseOrderItemId,
    pub purchase_order_id: PurchaseOrderId,
    pub material_type_id: MaterialTypeId,
    pub line_number: i32,
    pub description: String,
    pub width: Option<f64>,
    pub length: Option<f64>,
    pub thickness: Option<f64>,
    pub color: Option<String>,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
    pub line_total: f64,
    pub quantity_received: f64,
    /// ISO-8601 date (DATE column).
    pub received_date: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Query filters for PO listing.
#[derive(Debug, Clone, Default)]
pub struct PurchaseOrderFilters {
    pub status: Option<PurchaseOrderStatus>,
    pub supplier_id: Option<SupplierId>,
    pub auto_generated: Option<bool>,
    pub search: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// One row from `reorder_rules`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderRule {
    pub id: ReorderRuleId,
    pub material_type_id: MaterialTypeId,
    pub supplier_id: Option<SupplierId>,
    pub reorder_point: f64,
    pub reorder_quantity: f64,
    pub max_stock_level: Option<f64>,
    pub lead_time_days: i32,
    pub safety_stock_days: Option<i32>,
    pub auto_reorder: bool,
    pub active: bool,
    pub notes: Option<String>,
    pub last_triggered_at: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Embedded material_types row when selected with PostgREST
    /// embed syntax. Only populated on read paths where the UI needs
    /// the material name inline.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material_type: Option<MaterialType>,
    /// Embedded suppliers row. Null for rules with no preferred
    /// supplier; the suggestion engine falls back to
    /// `material_suppliers` lookup in that case.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supplier: Option<Supplier>,
}

/// Urgency classification on a reorder suggestion.
///
/// Normalized for the UI: `Normal` in the calculator maps to `Medium`
/// here. The DB and calc layers speak `normal`; the frontend reads
/// `medium`. We do the rename once at the use-case boundary so API
/// consumers only see the UI-flavored variants.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Urgency {
    Critical,
    High,
    Medium,
    Low,
}

/// Output shape for the `/api/v2/reorder-rules/suggestions` endpoint.
///
/// Preserves the full contract the TS `GenerateReorderSuggestions`
/// use case produces today — not just stock + urgency. See S3c plan
/// §"Reorder suggestion contract".
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderSuggestion {
    pub rule_id: ReorderRuleId,
    pub material_type_id: MaterialTypeId,
    pub material_name: String,
    pub current_stock_sqft: f64,
    pub threshold_sqft: f64,
    /// Suggested order quantity after safety-stock + pending-PO
    /// adjustments. Zero-or-below rules are filtered out before the
    /// suggestion is emitted.
    pub reorder_quantity_sqft: f64,
    pub urgency: Urgency,
    /// `None` when avg daily usage is zero (no cut history).
    pub days_until_stockout: Option<i32>,
    pub estimated_cost: Option<f64>,
    pub supplier_id: Option<SupplierId>,
    pub supplier_name: Option<String>,
    /// Sum of `quantity_sqft` across line items on non-draft POs for
    /// this material. Subtracts from the suggested quantity.
    pub pending_quantity_sqft: f64,
    pub has_pending_po: bool,
}

/// A single parsed row from an inventory CSV import. Matches the
/// reviewed-row shape the dedicated import page sends to
/// `/api/v2/import/rolls` after the browser review step.
///
/// `material_type_id` may be null when the user typed a name that
/// doesn't resolve yet — the Rust handler auto-creates the
/// `material_types` row on commit, same as the TS behavior today.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CsvImportRow {
    pub material_type_id: Option<MaterialTypeId>,
    /// Denormalized material name — used to resolve
    /// `material_type_id` when it's null, and to stamp
    /// `rolls.material_type` after insert.
    pub material_type: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    pub color: Option<String>,
    pub location: Option<String>,
    pub date_received: Option<String>,
    pub supplier: Option<String>,
    pub cost_per_sqft: Option<f64>,
    pub notes: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_allowed_targets_matches_state_machine() {
        use PurchaseOrderStatus::*;
        assert_eq!(Draft.allowed_targets_from(), &[Pending, Cancelled]);
        assert_eq!(
            Pending.allowed_targets_from(),
            &[Approved, Draft, Cancelled]
        );
        assert_eq!(Approved.allowed_targets_from(), &[Ordered, Cancelled]);
        // `received` is NOT reachable from `ordered` via the generic
        // status path — only via the receive flow.
        assert_eq!(Ordered.allowed_targets_from(), &[Cancelled]);
        assert!(Received.allowed_targets_from().is_empty());
        assert_eq!(Cancelled.allowed_targets_from(), &[Draft]);
    }

    #[test]
    fn received_cannot_be_reached_via_any_status_transition() {
        use PurchaseOrderStatus::*;
        for from in [Draft, Pending, Approved, Ordered, Cancelled] {
            assert!(
                !from.allowed_targets_from().contains(&Received),
                "status {:?} must not list Received as an allowed target",
                from
            );
        }
    }

    #[test]
    fn status_deserializes_lowercase() {
        let s: PurchaseOrderStatus = serde_json::from_str("\"draft\"").unwrap();
        assert_eq!(s, PurchaseOrderStatus::Draft);
        let s: PurchaseOrderStatus = serde_json::from_str("\"received\"").unwrap();
        assert_eq!(s, PurchaseOrderStatus::Received);
    }

    #[test]
    fn status_rejects_unknown_variant() {
        let err = serde_json::from_str::<PurchaseOrderStatus>("\"shipped\"");
        assert!(err.is_err(), "unknown status must not silently deserialize");
    }

    #[test]
    fn urgency_deserializes_lowercase() {
        let u: Urgency = serde_json::from_str("\"medium\"").unwrap();
        assert_eq!(u, Urgency::Medium);
        let u: Urgency = serde_json::from_str("\"critical\"").unwrap();
        assert_eq!(u, Urgency::Critical);
    }

    #[test]
    fn purchase_order_roundtrips_through_serde() {
        let po = PurchaseOrder {
            id: PurchaseOrderId("po-1".into()),
            po_number: "PO-26-0001".into(),
            supplier_id: SupplierId("sup-1".into()),
            status: PurchaseOrderStatus::Draft,
            order_date: None,
            requested_delivery_date: Some("2026-05-01".into()),
            actual_delivery_date: None,
            subtotal: 100.0,
            tax_amount: 8.25,
            shipping_cost: 15.0,
            total_amount: 123.25,
            payment_terms: Some("Net 30".into()),
            shipping_address: None,
            billing_address: None,
            notes: None,
            created_by: Some("user-1".into()),
            approved_by: None,
            approved_at: None,
            auto_generated: false,
            reorder_rule_id: None,
            created_at: Some("2026-04-19T00:00:00Z".into()),
            updated_at: Some("2026-04-19T00:00:00Z".into()),
        };
        let json = serde_json::to_string(&po).unwrap();
        let back: PurchaseOrder = serde_json::from_str(&json).unwrap();
        assert_eq!(back.po_number, "PO-26-0001");
        assert_eq!(back.status, PurchaseOrderStatus::Draft);
        assert_eq!(back.total_amount, 123.25);
    }

    #[test]
    fn purchase_order_item_roundtrips() {
        let item = PurchaseOrderItem {
            id: PurchaseOrderItemId("poi-1".into()),
            purchase_order_id: PurchaseOrderId("po-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            line_number: 1,
            description: "1/4in Neoprene, 48in wide".into(),
            width: Some(48.0),
            length: Some(600.0),
            thickness: Some(0.25),
            color: Some("Black".into()),
            quantity_sqft: 100.0,
            unit_cost: 3.50,
            line_total: 350.0,
            quantity_received: 0.0,
            received_date: None,
            notes: None,
            created_at: None,
            updated_at: None,
        };
        let json = serde_json::to_string(&item).unwrap();
        let back: PurchaseOrderItem = serde_json::from_str(&json).unwrap();
        assert_eq!(back.line_number, 1);
        assert_eq!(back.line_total, 350.0);
    }

    #[test]
    fn reorder_rule_roundtrips_with_optional_embeds() {
        let rule = ReorderRule {
            id: ReorderRuleId("rr-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            supplier_id: Some(SupplierId("sup-1".into())),
            reorder_point: 500.0,
            reorder_quantity: 1000.0,
            max_stock_level: Some(2000.0),
            lead_time_days: 7,
            safety_stock_days: Some(3),
            auto_reorder: false,
            active: true,
            notes: None,
            last_triggered_at: None,
            created_at: None,
            updated_at: None,
            material_type: None,
            supplier: None,
        };
        let json = serde_json::to_string(&rule).unwrap();
        // Embeds skip when None — keeps round-trip stable.
        assert!(!json.contains("\"material_type\":"));
        assert!(!json.contains("\"supplier\":"));
        let back: ReorderRule = serde_json::from_str(&json).unwrap();
        assert_eq!(back.reorder_quantity, 1000.0);
        assert!(back.active);
    }

    #[test]
    fn reorder_suggestion_roundtrips() {
        let s = ReorderSuggestion {
            rule_id: ReorderRuleId("rr-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            material_name: "Neoprene".into(),
            current_stock_sqft: 200.0,
            threshold_sqft: 500.0,
            reorder_quantity_sqft: 800.0,
            urgency: Urgency::High,
            days_until_stockout: Some(5),
            estimated_cost: Some(2400.0),
            supplier_id: Some(SupplierId("sup-1".into())),
            supplier_name: Some("Acme Rubber".into()),
            pending_quantity_sqft: 0.0,
            has_pending_po: false,
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: ReorderSuggestion = serde_json::from_str(&json).unwrap();
        assert_eq!(back.urgency, Urgency::High);
        assert_eq!(back.days_until_stockout, Some(5));
    }

    #[test]
    fn csv_import_row_allows_null_material_type_id() {
        let json = r#"{
            "material_type_id": null,
            "material_type": "NewMaterial",
            "width": 48.0,
            "length": 600.0,
            "thickness": 0.25,
            "color": null,
            "location": null,
            "date_received": null,
            "supplier": null,
            "cost_per_sqft": null,
            "notes": null
        }"#;
        let row: CsvImportRow = serde_json::from_str(json).unwrap();
        assert!(row.material_type_id.is_none());
        assert_eq!(row.material_type, "NewMaterial");
    }
}
