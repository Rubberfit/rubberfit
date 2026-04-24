//! PostgREST-backed implementation of `MaterialSupplierPort`.
//!
//! Read paths use PostgREST's embed aliasing:
//! `?select=*,material_type:material_types(*),supplier:suppliers(*)`.
//! That way the response JSON's embedded rows land on the aliased
//! `material_type` / `supplier` fields — matching the
//! `MaterialSupplier` domain struct's serde rename — instead of the
//! plural `material_types` / `suppliers` PostgREST would return by
//! default.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::inventory::{
    MaterialSupplierFilters, MaterialSupplierPort, MaterialSupplierUpdate, NewMaterialSupplier,
};
use rf_domain::{MaterialSupplier, MaterialSupplierId};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

const SELECT_WITH_EMBEDS: &str = "*,material_type:material_types(*),supplier:suppliers(*)";

pub struct SupabaseMaterialSupplierRepository {
    client: PostgrestClient,
}

impl SupabaseMaterialSupplierRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewMaterialSupplierRow<'a> {
    material_type_id: &'a str,
    supplier_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    supplier_material_code: Option<&'a str>,
    cost_per_sqft: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    minimum_order_sqft: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lead_time_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preferred_supplier: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    effective_date: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    expiration_date: Option<&'a str>,
}

#[async_trait]
impl MaterialSupplierPort for SupabaseMaterialSupplierRepository {
    async fn list(
        &self,
        filters: &MaterialSupplierFilters,
    ) -> Result<Vec<MaterialSupplier>, AppError> {
        let mut query: Vec<(String, String)> = vec![
            ("select".into(), SELECT_WITH_EMBEDS.into()),
            (
                "order".into(),
                "preferred_supplier.desc,cost_per_sqft.asc".into(),
            ),
        ];
        if let Some(mt) = filters.material_type_id.as_ref() {
            query.push(("material_type_id".into(), format!("eq.{}", mt.0)));
        }
        if let Some(s) = filters.supplier_id.as_ref() {
            query.push(("supplier_id".into(), format!("eq.{}", s.0)));
        }
        if let Some(active) = filters.active {
            query.push(("active".into(), format!("eq.{active}")));
        }
        if let Some(limit) = filters.limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = filters.offset {
            query.push(("offset".into(), offset.to_string()));
        }
        let pairs: Vec<(&str, &str)> = query
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();
        self.client
            .get::<Vec<MaterialSupplier>>("/rest/v1/material_suppliers", &pairs)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(&self, id: &MaterialSupplierId) -> Result<Option<MaterialSupplier>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [
            ("select", SELECT_WITH_EMBEDS),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ];
        let mut rows: Vec<MaterialSupplier> = self
            .client
            .get::<Vec<MaterialSupplier>>("/rest/v1/material_suppliers", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(&self, new: &NewMaterialSupplier) -> Result<MaterialSupplier, AppError> {
        let row = NewMaterialSupplierRow {
            material_type_id: &new.material_type_id.0,
            supplier_id: &new.supplier_id.0,
            supplier_material_code: new.supplier_material_code.as_deref(),
            cost_per_sqft: new.cost_per_sqft,
            minimum_order_sqft: new.minimum_order_sqft,
            lead_time_days: new.lead_time_days,
            preferred_supplier: new.preferred_supplier,
            active: new.active,
            notes: new.notes.as_deref(),
            effective_date: new.effective_date.as_deref(),
            expiration_date: new.expiration_date.as_deref(),
        };
        // POST doesn't use the embed alias — PostgREST's Prefer:
        // return=representation echoes the inserted row, and we
        // don't need parents populated on the immediate write
        // response. GETs after the fact will include them.
        match self
            .client
            .post::<_, Vec<MaterialSupplier>>("/rest/v1/material_suppliers", &row)
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
        id: &MaterialSupplierId,
        patch: &MaterialSupplierUpdate,
    ) -> Result<Option<MaterialSupplier>, AppError> {
        let mut body = Map::new();
        if let Some(v) = patch.supplier_material_code.clone() {
            body.insert(
                "supplier_material_code".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.cost_per_sqft {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("cost_per_sqft".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.minimum_order_sqft {
            body.insert(
                "minimum_order_sqft".into(),
                v.and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.lead_time_days {
            body.insert(
                "lead_time_days".into(),
                v.map(|d| Value::Number(d.into())).unwrap_or(Value::Null),
            );
        }
        if let Some(b) = patch.preferred_supplier {
            body.insert("preferred_supplier".into(), Value::Bool(b));
        }
        if let Some(b) = patch.active {
            body.insert("active".into(), Value::Bool(b));
        }
        if let Some(v) = patch.notes.clone() {
            body.insert("notes".into(), v.map(Value::String).unwrap_or(Value::Null));
        }
        if let Some(v) = patch.effective_date.clone() {
            body.insert(
                "effective_date".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.expiration_date.clone() {
            body.insert(
                "expiration_date".into(),
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
            .patch::<_, Vec<MaterialSupplier>>(
                "/rest/v1/material_suppliers",
                &query,
                &Value::Object(body),
            )
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &MaterialSupplierId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<MaterialSupplier>>("/rest/v1/material_suppliers", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_PAIR"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        _ => AppError::infrastructure(err),
    }
}
