//! PostgREST-backed implementation of `MaterialTypePort`.
//!
//! Each write verb maps directly onto the `material_types` REST
//! endpoint. Postgres-specific error codes (23505 unique violation,
//! 23503 FK violation) are translated to stable application-level
//! conflict codes the UI can localize against.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::inventory::{MaterialTypePort, MaterialTypeUpdate, NewMaterialType};
use rf_domain::{MaterialType, MaterialTypeId};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

/// Postgres SQLSTATE for a unique-constraint violation.
const PG_UNIQUE_VIOLATION: &str = "23505";
/// Postgres SQLSTATE for a foreign-key violation.
const PG_FK_VIOLATION: &str = "23503";

pub struct SupabaseMaterialTypeRepository {
    client: PostgrestClient,
}

impl SupabaseMaterialTypeRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewMaterialTypeRow<'a> {
    name: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    default_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    min_stock_alert: Option<f64>,
}

#[async_trait]
impl MaterialTypePort for SupabaseMaterialTypeRepository {
    async fn list(&self) -> Result<Vec<MaterialType>, AppError> {
        let query = [("select", "*"), ("order", "name.asc")];
        self.client
            .get::<Vec<MaterialType>>("/rest/v1/material_types", &query)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(&self, id: &MaterialTypeId) -> Result<Option<MaterialType>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("select", "*"), ("id", id_filter.as_str()), ("limit", "1")];
        let mut rows: Vec<MaterialType> = self
            .client
            .get::<Vec<MaterialType>>("/rest/v1/material_types", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(&self, new: &NewMaterialType) -> Result<MaterialType, AppError> {
        let row = NewMaterialTypeRow {
            name: &new.name,
            description: new.description.as_deref(),
            default_cost: new.default_cost,
            min_stock_alert: new.min_stock_alert,
        };
        match self
            .client
            .post::<_, Vec<MaterialType>>("/rest/v1/material_types", &row)
            .await
        {
            Ok(mut rows) => rows
                .pop()
                .ok_or_else(|| AppError::infrastructure("insert returned empty array")),
            Err(err) => Err(map_write_error(err, "material_types")),
        }
    }

    async fn update(
        &self,
        id: &MaterialTypeId,
        patch: &MaterialTypeUpdate,
    ) -> Result<Option<MaterialType>, AppError> {
        // Build the patch body dynamically so we only send fields the
        // caller actually wants to change. Passing `null` vs. omitting
        // a field have different meanings in PostgREST; the
        // double-Option on the patch struct lets callers distinguish.
        let mut body = Map::new();
        if let Some(name) = patch.name.clone() {
            body.insert("name".into(), Value::String(name));
        }
        if let Some(desc) = patch.description.clone() {
            body.insert(
                "description".into(),
                desc.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(cost) = patch.default_cost {
            body.insert(
                "default_cost".into(),
                cost.and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null),
            );
        }
        if let Some(msa) = patch.min_stock_alert {
            body.insert(
                "min_stock_alert".into(),
                msa.and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null),
            );
        }

        if body.is_empty() {
            // No-op patch — return the current row if it exists.
            return self.get(id).await;
        }

        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .patch::<_, Vec<MaterialType>>("/rest/v1/material_types", &query, &Value::Object(body))
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err, "material_types")),
        }
    }

    async fn delete(&self, id: &MaterialTypeId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<MaterialType>>("/rest/v1/material_types", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err, "material_types")),
        }
    }
}

/// Translate Postgres-level errors surfacing through PostgREST into
/// the application's conflict vocabulary. Callers don't see the raw
/// SQLSTATE; they see a stable code like `DUPLICATE_NAME` the UI
/// can localize against.
fn map_write_error(err: PostgrestError, table: &'static str) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_NAME"),
        Some(PG_FK_VIOLATION) => AppError::conflict(match table {
            "material_types" => "FK_VIOLATION_ROLLS_EXIST",
            _ => "FK_VIOLATION",
        }),
        _ => AppError::infrastructure(err),
    }
}
