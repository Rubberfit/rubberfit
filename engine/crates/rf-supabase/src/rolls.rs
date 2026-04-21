//! PostgREST-backed implementation of `RollPort`.
//!
//! List supports the full filter surface: status, material_type_id,
//! location, ILIKE search across five text columns. Writes stamp
//! the denormalized `material_type` name from whatever the handler
//! passes; the handler is responsible for looking it up from the
//! `material_types` table before calling so the two stay in sync.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::inventory::{NewRoll, RollPort, RollUpdate};
use rf_domain::{Roll, RollFilters, RollId, RollStatus};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

pub struct SupabaseRollRepository {
    client: PostgrestClient,
}

impl SupabaseRollRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewRollRow<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    material_type_id: Option<&'a str>,
    material_type: &'a str,
    width: f64,
    length: f64,
    thickness: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    color: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    location: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date_received: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    supplier: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    cost_per_sqft: Option<f64>,
    remaining_length: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
}

fn status_str(s: RollStatus) -> &'static str {
    match s {
        RollStatus::Active => "active",
        RollStatus::Depleted => "depleted",
        RollStatus::Reserved => "reserved",
    }
}

#[async_trait]
impl RollPort for SupabaseRollRepository {
    async fn list(&self, filters: &RollFilters) -> Result<Vec<Roll>, AppError> {
        let mut query: Vec<(String, String)> = vec![
            ("select".into(), "*".into()),
            ("order".into(), "created_at.desc".into()),
        ];
        if let Some(status) = filters.status {
            query.push(("status".into(), format!("eq.{}", status_str(status))));
        }
        if let Some(mt) = filters.material_type_id.as_ref() {
            query.push(("material_type_id".into(), format!("eq.{}", mt.0)));
        }
        if let Some(loc) = filters.location.as_deref() {
            query.push(("location".into(), format!("eq.{loc}")));
        }
        if let Some(search) = filters.search.as_deref() {
            let term = escape_ilike(search);
            query.push((
                "or".into(),
                format!(
                    "(material_type.ilike.*{term}*,color.ilike.*{term}*,\
                     location.ilike.*{term}*,supplier.ilike.*{term}*,\
                     notes.ilike.*{term}*)"
                ),
            ));
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
            .get::<Vec<Roll>>("/rest/v1/rolls", &pairs)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(&self, id: &RollId) -> Result<Option<Roll>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("select", "*"), ("id", id_filter.as_str()), ("limit", "1")];
        let mut rows: Vec<Roll> = self
            .client
            .get::<Vec<Roll>>("/rest/v1/rolls", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(&self, new: &NewRoll) -> Result<Roll, AppError> {
        let row = NewRollRow {
            material_type_id: new.material_type_id.as_deref(),
            material_type: &new.material_type,
            width: new.width,
            length: new.length,
            thickness: new.thickness,
            color: new.color.as_deref(),
            location: new.location.as_deref(),
            date_received: new.date_received.as_deref(),
            supplier: new.supplier.as_deref(),
            cost_per_sqft: new.cost_per_sqft,
            remaining_length: new.remaining_length,
            status: new.status.map(status_str),
            notes: new.notes.as_deref(),
        };
        match self
            .client
            .post::<_, Vec<Roll>>("/rest/v1/rolls", &row)
            .await
        {
            Ok(mut rows) => rows
                .pop()
                .ok_or_else(|| AppError::infrastructure("insert returned empty array")),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn update(&self, id: &RollId, patch: &RollUpdate) -> Result<Option<Roll>, AppError> {
        let mut body = Map::new();
        if let Some(v) = patch.material_type_id.clone() {
            body.insert(
                "material_type_id".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.material_type.clone() {
            body.insert("material_type".into(), Value::String(v));
        }
        if let Some(v) = patch.width {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("width".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.length {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("length".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.thickness {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("thickness".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.color.clone() {
            body.insert("color".into(), v.map(Value::String).unwrap_or(Value::Null));
        }
        if let Some(v) = patch.location.clone() {
            body.insert(
                "location".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.date_received.clone() {
            body.insert(
                "date_received".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.supplier.clone() {
            body.insert(
                "supplier".into(),
                v.map(Value::String).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.cost_per_sqft {
            body.insert(
                "cost_per_sqft".into(),
                v.and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.remaining_length {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("remaining_length".into(), Value::Number(n));
            }
        }
        if let Some(s) = patch.status {
            body.insert("status".into(), Value::String(status_str(s).into()));
        }
        if let Some(v) = patch.notes.clone() {
            body.insert("notes".into(), v.map(Value::String).unwrap_or(Value::Null));
        }

        if body.is_empty() {
            return self.get(id).await;
        }

        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .patch::<_, Vec<Roll>>("/rest/v1/rolls", &query, &Value::Object(body))
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &RollId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<Roll>>("/rest/v1/rolls", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn escape_ilike(search: &str) -> String {
    search.replace([',', '*'], "")
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_VALUE"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        _ => AppError::infrastructure(err),
    }
}
