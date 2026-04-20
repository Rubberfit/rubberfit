//! PostgREST-backed implementation of `PurchaseOrderItemPort` (S3c Task 2).
//!
//! `line_total` is populated by the
//! `trigger_calculate_po_item_line_total` DB trigger on every
//! INSERT/UPDATE of quantity_sqft or unit_cost. The adapter never
//! sets it directly; `Prefer: return=representation` carries the
//! trigger-populated value back in the response.
//!
//! `line_number` is allocated inside the adapter: we read the current
//! max for the target PO, add one, and include it in the insert
//! payload. Under Fly autoscale there is a race window where two
//! parallel adders can compute the same "next" number; the
//! UNIQUE(purchase_order_id, line_number) constraint catches that
//! case. We map the 23505 to a Conflict the handler surfaces as 409
//! `LINE_NUMBER_RACE`, prompting the UI to retry (it already retries
//! on `DUPLICATE_VALUE` today).

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{
    NewPurchaseOrderItem, PurchaseOrderItemPort, PurchaseOrderItemUpdate,
};
use rf_domain::{PurchaseOrderId, PurchaseOrderItem, PurchaseOrderItemId};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

pub struct SupabasePurchaseOrderItemRepository {
    client: PostgrestClient,
}

impl SupabasePurchaseOrderItemRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }

    async fn next_line_number(
        &self,
        po_id: &PurchaseOrderId,
    ) -> Result<i32, AppError> {
        // Narrow projection — pull only `line_number` so the read is
        // cheap, ordered desc + limit 1 for the current max.
        #[derive(Deserialize)]
        struct LineOnly {
            line_number: i32,
        }
        let po_filter = format!("eq.{}", po_id.0);
        let query = [
            ("select", "line_number"),
            ("purchase_order_id", po_filter.as_str()),
            ("order", "line_number.desc"),
            ("limit", "1"),
        ];
        let rows: Vec<LineOnly> = self
            .client
            .get("/rest/v1/purchase_order_items", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.first().map(|r| r.line_number).unwrap_or(0) + 1)
    }
}

#[derive(Serialize)]
struct NewPurchaseOrderItemRow<'a> {
    purchase_order_id: &'a str,
    material_type_id: &'a str,
    line_number: i32,
    description: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thickness: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<&'a str>,
    quantity_sqft: f64,
    unit_cost: f64,
    /// Line_total is trigger-populated on INSERT/UPDATE of
    /// quantity_sqft/unit_cost. The column is NOT NULL with no
    /// default, so we have to include it on insert — the trigger
    /// overwrites whatever we pass. Stamping the client-side value
    /// keeps the insert valid even if the trigger is disabled for
    /// maintenance.
    line_total: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
}

#[async_trait]
impl PurchaseOrderItemPort for SupabasePurchaseOrderItemRepository {
    async fn list_for_po(
        &self,
        po_id: &PurchaseOrderId,
    ) -> Result<Vec<PurchaseOrderItem>, AppError> {
        let po_filter = format!("eq.{}", po_id.0);
        let query = [
            ("select", "*"),
            ("purchase_order_id", po_filter.as_str()),
            ("order", "line_number.asc"),
        ];
        self.client
            .get::<Vec<PurchaseOrderItem>>("/rest/v1/purchase_order_items", &query)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(
        &self,
        id: &PurchaseOrderItemId,
    ) -> Result<Option<PurchaseOrderItem>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [
            ("select", "*"),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ];
        let mut rows: Vec<PurchaseOrderItem> = self
            .client
            .get::<Vec<PurchaseOrderItem>>("/rest/v1/purchase_order_items", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(
        &self,
        po_id: &PurchaseOrderId,
        new: &NewPurchaseOrderItem,
    ) -> Result<PurchaseOrderItem, AppError> {
        let line_number = self.next_line_number(po_id).await?;
        let line_total = round_cents(new.quantity_sqft * new.unit_cost);
        let row = NewPurchaseOrderItemRow {
            purchase_order_id: &po_id.0,
            material_type_id: &new.material_type_id.0,
            line_number,
            description: &new.description,
            width: new.width,
            length: new.length,
            thickness: new.thickness,
            color: new.color.as_deref(),
            quantity_sqft: new.quantity_sqft,
            unit_cost: new.unit_cost,
            line_total,
            notes: new.notes.as_deref(),
        };
        match self
            .client
            .post::<_, Vec<PurchaseOrderItem>>(
                "/rest/v1/purchase_order_items",
                &row,
            )
            .await
        {
            Ok(mut rows) => rows
                .pop()
                .ok_or_else(|| AppError::infrastructure("insert returned empty array")),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn update(
        &self,
        id: &PurchaseOrderItemId,
        patch: &PurchaseOrderItemUpdate,
    ) -> Result<Option<PurchaseOrderItem>, AppError> {
        let mut body = Map::new();
        if let Some(v) = patch.material_type_id.as_ref() {
            body.insert("material_type_id".into(), Value::String(v.0.clone()));
        }
        if let Some(v) = patch.description.as_deref() {
            body.insert("description".into(), Value::String(v.to_string()));
        }
        // For the dimension fields we want to distinguish three
        // wire cases: omitted (don't touch the column), explicit
        // null (set column to NULL), or a finite number (set
        // column to that number). The use case upstream validates
        // that non-null values are finite, but defense-in-depth
        // says: an adapter that silently drops NaN/Inf would be a
        // latent bug the day the use case stops being the only
        // caller. Return an error instead so the call site sees
        // the failure. Outer `Option` is "was the field in the
        // patch?" (Some = touch the column); inner `Option` is
        // "null or a value?" (None = NULL). Unwrapping the outer
        // before calling the helper makes that clearer.
        if let Some(v) = patch.width {
            write_nullable_number(&mut body, "width", v)?;
        }
        if let Some(v) = patch.length {
            write_nullable_number(&mut body, "length", v)?;
        }
        if let Some(v) = patch.thickness {
            write_nullable_number(&mut body, "thickness", v)?;
        }
        if let Some(v) = patch.color.clone() {
            body.insert(
                "color".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.quantity_sqft {
            write_finite_number(&mut body, "quantity_sqft", v)?;
        }
        if let Some(v) = patch.unit_cost {
            write_finite_number(&mut body, "unit_cost", v)?;
        }
        if let Some(v) = patch.notes.clone() {
            body.insert(
                "notes".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }

        if body.is_empty() {
            return self.get(id).await;
        }

        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .patch::<_, Vec<PurchaseOrderItem>>(
                "/rest/v1/purchase_order_items",
                &query,
                &Value::Object(body),
            )
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &PurchaseOrderItemId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<PurchaseOrderItem>>(
                "/rest/v1/purchase_order_items",
                &query,
            )
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn round_cents(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Insert a finite f64 as a JSON Number, error on NaN / Infinity.
/// Used for fields the use case has already validated as positive
/// + finite; an error here means the invariant slipped.
fn write_finite_number(
    body: &mut Map<String, Value>,
    field: &str,
    v: f64,
) -> Result<(), AppError> {
    let n = serde_json::Number::from_f64(v).ok_or_else(|| {
        AppError::InvalidInput(format!("{field} must be a finite number"))
    })?;
    body.insert(field.into(), Value::Number(n));
    Ok(())
}

/// Insert a nullable optional f64. `Some(Some(v))` with v finite →
/// JSON Number; `Some(None)` → JSON null (explicit clear); `None`
/// (not represented here since the caller already unwraps the outer
/// Option) would leave the field untouched. NaN/Inf → error.
fn write_nullable_number(
    body: &mut Map<String, Value>,
    field: &str,
    v: Option<f64>,
) -> Result<(), AppError> {
    match v {
        Some(n) => write_finite_number(body, field, n),
        None => {
            body.insert(field.into(), Value::Null);
            Ok(())
        }
    }
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        // Unique violation on (purchase_order_id, line_number) —
        // two concurrent adders computed the same "next" number.
        // Surfacing as a dedicated code lets the UI auto-retry
        // instead of bubbling a generic "value already exists" toast.
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("LINE_NUMBER_RACE"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        _ => AppError::infrastructure(err),
    }
}
