//! PostgREST-backed `ReorderRulePort` (S3c Task 6).
//!
//! Straight CRUD over the `reorder_rules` table. `last_triggered_at`
//! is bumped via `touch_triggered_at`, called by the reorder→PO use
//! case in Task 7.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::procurement::{NewReorderRule, ReorderRulePort, ReorderRuleUpdate};
use rf_domain::{ReorderRule, ReorderRuleId};
use serde::Serialize;
use serde_json::{Map, Value};

use crate::postgrest::{PostgrestClient, PostgrestError};

const PG_UNIQUE_VIOLATION: &str = "23505";
const PG_FK_VIOLATION: &str = "23503";
const PG_CHECK_VIOLATION: &str = "23514";

pub struct SupabaseReorderRuleRepository {
    client: PostgrestClient,
}

impl SupabaseReorderRuleRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct NewReorderRuleRow<'a> {
    material_type_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    supplier_id: Option<&'a str>,
    reorder_point: f64,
    reorder_quantity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_stock_level: Option<f64>,
    lead_time_days: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    safety_stock_days: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    auto_reorder: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    notes: Option<&'a str>,
}

#[async_trait]
impl ReorderRulePort for SupabaseReorderRuleRepository {
    async fn list(&self) -> Result<Vec<ReorderRule>, AppError> {
        // Embed material_type + supplier so the UI can render
        // without per-rule follow-ups, same as S3b's
        // material_suppliers adapter. `!inner` would filter out
        // rules whose supplier was deleted (SET NULL on the FK);
        // the bare `suppliers(*)` embed returns `null` for those,
        // which matches the domain type's `Option<Supplier>`.
        let query = [
            ("select", "*,material_type:material_types(*),supplier:suppliers(*)"),
            ("order", "created_at.desc"),
        ];
        self.client
            .get::<Vec<ReorderRule>>("/rest/v1/reorder_rules", &query)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get(
        &self,
        id: &ReorderRuleId,
    ) -> Result<Option<ReorderRule>, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [
            ("select", "*,material_type:material_types(*),supplier:suppliers(*)"),
            ("id", id_filter.as_str()),
            ("limit", "1"),
        ];
        let mut rows: Vec<ReorderRule> = self
            .client
            .get::<Vec<ReorderRule>>("/rest/v1/reorder_rules", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn create(
        &self,
        new: &NewReorderRule,
    ) -> Result<ReorderRule, AppError> {
        let row = NewReorderRuleRow {
            material_type_id: &new.material_type_id.0,
            supplier_id: new.supplier_id.as_ref().map(|s| s.0.as_str()),
            reorder_point: new.reorder_point,
            reorder_quantity: new.reorder_quantity,
            max_stock_level: new.max_stock_level,
            lead_time_days: new.lead_time_days,
            safety_stock_days: new.safety_stock_days,
            auto_reorder: new.auto_reorder,
            active: new.active,
            notes: new.notes.as_deref(),
        };
        match self
            .client
            .post::<_, Vec<ReorderRule>>("/rest/v1/reorder_rules", &row)
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
        id: &ReorderRuleId,
        patch: &ReorderRuleUpdate,
    ) -> Result<Option<ReorderRule>, AppError> {
        let mut body = Map::new();
        if let Some(v) = patch.supplier_id.clone() {
            body.insert(
                "supplier_id".into(),
                v.map(|s| Value::String(s.0)).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.reorder_point {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("reorder_point".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.reorder_quantity {
            if let Some(n) = serde_json::Number::from_f64(v) {
                body.insert("reorder_quantity".into(), Value::Number(n));
            }
        }
        if let Some(v) = patch.max_stock_level {
            body.insert(
                "max_stock_level".into(),
                v.and_then(serde_json::Number::from_f64)
                    .map(Value::Number)
                    .unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.lead_time_days {
            body.insert("lead_time_days".into(), Value::Number(v.into()));
        }
        if let Some(v) = patch.safety_stock_days {
            body.insert(
                "safety_stock_days".into(),
                v.map(|n| Value::Number(n.into())).unwrap_or(Value::Null),
            );
        }
        if let Some(v) = patch.auto_reorder {
            body.insert("auto_reorder".into(), Value::Bool(v));
        }
        if let Some(v) = patch.active {
            body.insert("active".into(), Value::Bool(v));
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
            .patch::<_, Vec<ReorderRule>>(
                "/rest/v1/reorder_rules",
                &query,
                &Value::Object(body),
            )
            .await
        {
            Ok(mut rows) => Ok(rows.pop()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn touch_triggered_at(
        &self,
        id: &ReorderRuleId,
    ) -> Result<(), AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        // Rust client clock — good enough for "last seen an
        // associated PO"; no ordering invariant hangs on it. DB
        // default on the column is NULL (never fired).
        let now = chrono::Utc::now()
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let body = serde_json::json!({ "last_triggered_at": now });
        match self
            .client
            .patch::<_, Vec<ReorderRule>>("/rest/v1/reorder_rules", &query, &body)
            .await
        {
            Ok(_) => Ok(()),
            Err(err) => Err(map_write_error(err)),
        }
    }

    async fn delete(&self, id: &ReorderRuleId) -> Result<bool, AppError> {
        let id_filter = format!("eq.{}", id.0);
        let query = [("id", id_filter.as_str())];
        match self
            .client
            .delete::<Vec<ReorderRule>>("/rest/v1/reorder_rules", &query)
            .await
        {
            Ok(rows) => Ok(!rows.is_empty()),
            Err(err) => Err(map_write_error(err)),
        }
    }
}

fn map_write_error(err: PostgrestError) -> AppError {
    match err.pg_code() {
        // `UNIQUE (material_type_id)` → a rule already exists for
        // this material. Distinct code so the UI can surface
        // "edit the existing rule instead" rather than a generic
        // "duplicate value".
        Some(PG_UNIQUE_VIOLATION) => AppError::conflict("DUPLICATE_MATERIAL_RULE"),
        Some(PG_FK_VIOLATION) => AppError::conflict("FK_VIOLATION_PARENT_MISSING"),
        Some(PG_CHECK_VIOLATION) => AppError::conflict("CHECK_VIOLATION"),
        _ => AppError::infrastructure(err),
    }
}
