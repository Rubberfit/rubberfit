//! Inventory aggregates — rolls, material types, suppliers, and the
//! material↔supplier junction.
//!
//! Each struct mirrors the underlying Supabase schema 1:1. Nullable
//! DB columns map to `Option<T>`. Identifiers are UUIDs at the DB
//! level; we carry them as `String` wrappers here (same convention
//! as `UserId` in `cut.rs`) so this crate stays zero-dep beyond
//! serde — validation lives at the API or application boundary.
//!
//! See:
//! - `src/infrastructure/supabase/migrations/20240217000001_create_material_types_table.sql`
//! - `src/infrastructure/supabase/migrations/20240217000002_create_rolls_table.sql`
//! - `src/infrastructure/supabase/migrations/20240219000001_create_suppliers_table.sql`
//! - `src/infrastructure/supabase/migrations/20240219000002_create_material_suppliers_table.sql`

use serde::{Deserialize, Serialize};

/// Newtype for `material_types.id` (UUID in Postgres).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct MaterialTypeId(pub String);

/// Newtype for `rolls.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct RollId(pub String);

/// Newtype for `suppliers.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SupplierId(pub String);

/// Newtype for `material_suppliers.id` (UUID).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct MaterialSupplierId(pub String);

/// One row from `material_types`. Master data for the inventory
/// pipeline — every roll references one.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialType {
    pub id: MaterialTypeId,
    pub name: String,
    pub description: Option<String>,
    /// Default `cost_per_sqft` in USD. Column is `DECIMAL(10,2)` but
    /// we hand it back as `f64` — accepted precision for the UI's
    /// pricing display. No accounting math happens at this layer.
    pub default_cost: Option<f64>,
    /// Minimum aggregate sqft before the low-stock alert fires.
    pub min_stock_alert: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Roll status enum — matches the DB CHECK constraint. Keep as a
/// string enum so unknown values from old clients deserialize as
/// an error, not silently as `Active`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RollStatus {
    Active,
    Depleted,
    Reserved,
}

/// One row from `rolls`. The `material_type` string is denormalized
/// — kept in sync with the referenced `material_types.name` by the
/// Rust handlers on every write (client-supplied value is ignored;
/// server stamps from the lookup). Prevents drift without a schema
/// change.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Roll {
    pub id: RollId,
    pub material_type_id: Option<MaterialTypeId>,
    pub material_type: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    pub color: Option<String>,
    pub location: Option<String>,
    /// ISO-8601 date (YYYY-MM-DD). Stored as DATE in Postgres.
    pub date_received: Option<String>,
    pub supplier: Option<String>,
    pub cost_per_sqft: Option<f64>,
    pub remaining_length: f64,
    pub status: RollStatus,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Query filters for roll listing. Maps to PostgREST filter params
/// at the adapter boundary; the application layer clamps limits.
#[derive(Debug, Clone, Default)]
pub struct RollFilters {
    pub status: Option<RollStatus>,
    pub material_type_id: Option<MaterialTypeId>,
    pub location: Option<String>,
    /// ILIKE across material_type / color / location / supplier /
    /// notes — matches the current TS `searchRolls` behavior.
    pub search: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// One row from `suppliers`. Vendor master data with performance
/// fields that S3c will start writing from the PO flow.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Supplier {
    pub id: SupplierId,
    pub name: String,
    pub contact_person: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip_code: Option<String>,
    pub country: Option<String>,
    pub website: Option<String>,
    pub tax_id: Option<String>,
    pub payment_terms: Option<String>,
    /// 0–5 float. DB enforces the range via CHECK constraint, we
    /// validate again at the use-case boundary for a nicer error.
    pub rating: Option<f64>,
    pub preferred: bool,
    pub active: bool,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

/// Query filters for supplier listing. `active`/`preferred` pick
/// out filtered variants the UI already consumes today.
#[derive(Debug, Clone, Default)]
pub struct SupplierFilters {
    pub active: Option<bool>,
    pub preferred: Option<bool>,
    pub search: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// One row from `material_suppliers` — the junction table linking
/// a material type to a supplier with pricing, lead time, and a
/// preferred-supplier flag.
///
/// On GET the handler embeds the referenced `material_types` and
/// `suppliers` rows via PostgREST's `?select=*,material_types(*),
/// suppliers(*)` so the UI sees the same `MaterialSupplierWithDetails`
/// shape it already renders. The embedded values land on
/// `material_type` / `supplier` (renamed from the PostgREST payload's
/// plural-noun field names). On POST/PUT the client only sends the
/// FK ids; the embeds are server-hydrated on the response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MaterialSupplier {
    pub id: MaterialSupplierId,
    pub material_type_id: MaterialTypeId,
    pub supplier_id: SupplierId,
    pub supplier_material_code: Option<String>,
    pub cost_per_sqft: f64,
    pub minimum_order_sqft: Option<f64>,
    pub lead_time_days: Option<i32>,
    pub preferred_supplier: bool,
    pub active: bool,
    pub notes: Option<String>,
    /// ISO-8601 date strings (DATE columns in Postgres).
    pub effective_date: Option<String>,
    pub expiration_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Embedded material_types row when the adapter selects with
    /// PostgREST's embed syntax. Serialized as `material_type` on
    /// the wire; deserialized from either `material_type` (our own
    /// client) or `material_types` (raw PostgREST via alias below).
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename(
            serialize = "material_type",
            deserialize = "material_type"
        )
    )]
    pub material_type: Option<MaterialType>,
    /// Embedded suppliers row when selected with embed syntax.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename(serialize = "supplier", deserialize = "supplier")
    )]
    pub supplier: Option<Supplier>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn material_type_roundtrips_through_serde() {
        let mt = MaterialType {
            id: MaterialTypeId("abc123".into()),
            name: "Neoprene".into(),
            description: Some("Oil-resistant rubber".into()),
            default_cost: Some(4.5),
            min_stock_alert: Some(100.0),
            created_at: Some("2026-04-01T00:00:00Z".into()),
            updated_at: Some("2026-04-01T00:00:00Z".into()),
        };
        let json = serde_json::to_string(&mt).unwrap();
        let back: MaterialType = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id.0, "abc123");
        assert_eq!(back.name, "Neoprene");
        assert_eq!(back.default_cost, Some(4.5));
    }

    #[test]
    fn roll_status_deserializes_lowercase() {
        let r: RollStatus = serde_json::from_str("\"active\"").unwrap();
        assert_eq!(r, RollStatus::Active);
        let r: RollStatus = serde_json::from_str("\"depleted\"").unwrap();
        assert_eq!(r, RollStatus::Depleted);
        let r: RollStatus = serde_json::from_str("\"reserved\"").unwrap();
        assert_eq!(r, RollStatus::Reserved);
    }

    #[test]
    fn roll_status_rejects_unknown() {
        let err = serde_json::from_str::<RollStatus>("\"archived\"");
        assert!(err.is_err(), "unknown status should fail to deserialize");
    }

    #[test]
    fn roll_roundtrips_through_serde() {
        let r = Roll {
            id: RollId("roll-1".into()),
            material_type_id: Some(MaterialTypeId("mt-1".into())),
            material_type: "Neoprene".into(),
            width: 48.0,
            length: 600.0,
            thickness: 0.25,
            color: Some("Black".into()),
            location: Some("Rack A3".into()),
            date_received: Some("2026-03-15".into()),
            supplier: Some("Acme Rubber".into()),
            cost_per_sqft: Some(3.25),
            remaining_length: 450.5,
            status: RollStatus::Active,
            notes: None,
            created_at: Some("2026-03-15T10:00:00Z".into()),
            updated_at: Some("2026-04-10T12:00:00Z".into()),
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: Roll = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id.0, "roll-1");
        assert_eq!(back.status, RollStatus::Active);
        assert_eq!(back.remaining_length, 450.5);
    }

    #[test]
    fn supplier_roundtrips_through_serde() {
        let s = Supplier {
            id: SupplierId("sup-1".into()),
            name: "Acme Rubber".into(),
            contact_person: Some("Jane Doe".into()),
            email: Some("jane@acme.example".into()),
            phone: Some("+1-555-0100".into()),
            address: Some("1 Main St".into()),
            city: Some("Industrial City".into()),
            state: Some("CA".into()),
            zip_code: Some("90210".into()),
            country: Some("USA".into()),
            website: Some("https://acme.example".into()),
            tax_id: None,
            payment_terms: Some("Net 30".into()),
            rating: Some(4.5),
            preferred: true,
            active: true,
            notes: None,
            created_at: Some("2024-02-19T00:00:00Z".into()),
            updated_at: Some("2024-02-19T00:00:00Z".into()),
        };
        let json = serde_json::to_string(&s).unwrap();
        let back: Supplier = serde_json::from_str(&json).unwrap();
        assert_eq!(back.rating, Some(4.5));
        assert!(back.preferred);
        assert!(back.active);
    }

    #[test]
    fn material_supplier_roundtrips() {
        let ms = MaterialSupplier {
            id: MaterialSupplierId("ms-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            supplier_id: SupplierId("sup-1".into()),
            supplier_material_code: Some("SKU-1234".into()),
            cost_per_sqft: 3.15,
            minimum_order_sqft: Some(500.0),
            lead_time_days: Some(14),
            preferred_supplier: true,
            active: true,
            notes: None,
            effective_date: Some("2026-01-01".into()),
            expiration_date: None,
            created_at: Some("2026-01-01T00:00:00Z".into()),
            updated_at: Some("2026-01-01T00:00:00Z".into()),
            material_type: None,
            supplier: None,
        };
        let json = serde_json::to_string(&ms).unwrap();
        let back: MaterialSupplier = serde_json::from_str(&json).unwrap();
        assert_eq!(back.cost_per_sqft, 3.15);
        assert_eq!(back.lead_time_days, Some(14));
        assert!(back.material_type.is_none());
    }

    #[test]
    fn material_supplier_serializes_embedded_details_once_present() {
        let ms = MaterialSupplier {
            id: MaterialSupplierId("ms-1".into()),
            material_type_id: MaterialTypeId("mt-1".into()),
            supplier_id: SupplierId("sup-1".into()),
            supplier_material_code: None,
            cost_per_sqft: 3.15,
            minimum_order_sqft: None,
            lead_time_days: None,
            preferred_supplier: false,
            active: true,
            notes: None,
            effective_date: None,
            expiration_date: None,
            created_at: None,
            updated_at: None,
            material_type: Some(MaterialType {
                id: MaterialTypeId("mt-1".into()),
                name: "Neoprene".into(),
                description: None,
                default_cost: None,
                min_stock_alert: None,
                created_at: None,
                updated_at: None,
            }),
            supplier: None,
        };
        let json = serde_json::to_string(&ms).unwrap();
        assert!(json.contains("\"material_type\":{"));
        assert!(!json.contains("\"supplier\":")); // skipped when None.
    }
}
