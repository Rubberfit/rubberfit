//! PostgREST-backed implementation of `PurchaseOrderPort` (S3c Task 2).
//!
//! Notable wrinkles:
//!
//! - `generate_number` calls the `generate_po_number()` Postgres RPC.
//!   As of the S3c Task 1 migration, that function uses a per-year
//!   SEQUENCE object and is race-safe under concurrent callers. The
//!   RPC returns a JSON string (e.g. `"PO-26-0001"`), which
//!   deserializes straight into `String`.
//! - On create, the adapter sends `po_number` on the insert payload
//!   (minted upstream in the use case). That keeps the adapter
//!   oblivious to the generator.
//! - Reads/writes use `Prefer: return=representation` so the trigger-
//!   populated `subtotal` / `total_amount` columns come back on the
//!   same round-trip.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{
    NewPurchaseOrder, PurchaseOrderPort, PurchaseOrderUpdate,
};
use rf_domain::{PurchaseOrder, PurchaseOrderFilters, PurchaseOrderId, PurchaseOrderStatus};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

pub struct SupabasePurchaseOrderRepository {
    client: PostgrestClient,
}

impl SupabasePurchaseOrderRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewPurchaseOrderRow<'a> {
    po_number: &'a str,
    supplier_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    order_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    requested_delivery_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tax_amount: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shipping_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payment_terms: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shipping_address: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    billing_address: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_by: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auto_generated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reorder_rule_id: Option<&'a str>,
}

#[async_trait]
impl PurchaseOrderPort for SupabasePurchaseOrderRepository {
    async fn list(
        &self,
        filters: &PurchaseOrderFilters,
    ) -> Result<Vec<PurchaseOrder>, AppError> {
        let mut query: Vec<(String, String)> = vec![
            ("select".into(), "*".into()),
            ("order".into(), "created_at.desc".into()),
        ];
        if let Some(status) = filters.status {
            query.push(("status".into(), format!("eq.{}", status.as_str())));
        }
        if let Some(sup) = filters.supplier_id.as_ref() {
            query.push(("supplier_id".into(), format!("eq.{}", sup.0)));
        }
        if let Some(ag) = filters.auto_generated {
            query.push(("auto_generated".into(), format!("eq.{ag}")));
        }
        if let Some(search) = filters.search.as_deref() {
            // PostgREST's `or=(...)` expression uses `,` as the
            // separator and `*` as the wildcard stand-in (rendered
            // as `%` before it hits Postgres). Neutralize both at
            // the boundary, plus Postgres's `%` / `_` / `\` LIKE
            // metacharacters so user-supplied literals don't
            // accidentally match extra rows. PostgREST defaults to
            // ESCAPE '\' on `ilike`, so `\%` / `\_` / `\\` are the
            // right escapes.
            let term = escape_ilike(search);
            query.push((
                "or".into(),
                format!(
                    "(po_number.ilike.*{term}*,notes.ilike.*{term}*,\
                     payment_terms.ilike.*{term}*)"
                ),
            ));
        }
        if let Some(limit) = filters.limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = filters.offset {
            query.push(("offset".into(), offset.to_string()));
        }
        let pairs: Vec<(&str, &str)> =
            query.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
        self.client
            .get::<Vec<PurchaseOrder>>("/rest/v1/purchase_orders", &pairs)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(
        &self,
        id: &PurchaseOrderId,
    ) -> Result<Option<PurchaseOrder>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [
            ("select", "*"),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ];
        let mut rows: Vec<PurchaseOrder> = self
            .client
            .get::<Vec<PurchaseOrder>>("/rest/v1/purchase_orders", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn generate_number(&self) -> Result<String, AppError> {
        // `generate_po_number()` takes no arguments; PostgREST still
        // requires a JSON body on RPC calls, so we send `{}`.
        #[derive(Serialize)]
        struct Empty {}
        let result: String = self
            .client
            .post::<_, String>("/rest/v1/rpc/generate_po_number", &Empty {})
            .await
            .map_err(AppError::infrastructure)?;
        Ok(result)
    }

    async fn create(
        &self,
        po_number: &str,
        new: &NewPurchaseOrder,
    ) -> Result<PurchaseOrder, AppError> {
        let row = NewPurchaseOrderRow {
            po_number,
            supplier_id: &new.supplier_id.0,
            status: new.status.map(PurchaseOrderStatus::as_str),
            order_date: new.order_date.as_deref(),
            requested_delivery_date: new.requested_delivery_date.as_deref(),
            tax_amount: new.tax_amount,
            shipping_cost: new.shipping_cost,
            payment_terms: new.payment_terms.as_deref(),
            shipping_address: new.shipping_address.as_deref(),
            billing_address: new.billing_address.as_deref(),
            notes: new.notes.as_deref(),
            created_by: new.created_by.as_deref(),
            auto_generated: new.auto_generated,
            reorder_rule_id: new.reorder_rule_id.as_deref(),
        };
        match self
            .client
            .post::<_, Vec<PurchaseOrder>>("/rest/v1/purchase_orders", &row)
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
        id: &PurchaseOrderId,
        patch: &PurchaseOrderUpdate,
    ) -> Result<Option<PurchaseOrder>, AppError> {
        let mut body = Map::new();
        if let Some(v) = patch.supplier_id.as_ref() {
            body.insert("supplier_id".into(), Value::String(v.0.clone()));
        }
        if let Some(v) = patch.order_date.clone() {
            body.insert(
                "order_date".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.requested_delivery_date.clone() {
            body.insert(
                "requested_delivery_date".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.tax_amount {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("tax_amount".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.shipping_cost {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("shipping_cost".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.payment_terms.clone() {
            body.insert(
                "payment_terms".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.shipping_address.clone() {
            body.insert(
                "shipping_address".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.billing_address.clone() {
            body.insert(
                "billing_address".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
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
            .patch::<_, Vec<PurchaseOrder>>(
                "/rest/v1/purchase_orders",
                &query,
                &Value::Object(body),
            )
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &PurchaseOrderId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<PurchaseOrder>>("/rest/v1/purchase_orders", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn escape_ilike(search: &str) -> String {
    // Order matters: backslash first so the subsequent `\%` / `\_`
    // we stamp aren't escaped again. Strip `(` / `)` since they
    // close the PostgREST `or=(...)` group if a user literal
    // contains them. `,` and `*` are PostgREST separators /
    // wildcards — removed rather than escaped because there's no
    // portable way to pass them through the `or` grammar.
    search
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
        .replace(['(', ')', ',', '*'], "")
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_VALUE"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        _ => AppError::infrastructure(err),
    }
}
