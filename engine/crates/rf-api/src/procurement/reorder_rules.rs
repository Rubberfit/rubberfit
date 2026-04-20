//! HTTP handlers for `/api/v2/reorder-rules` + `/suggestions`
//! (S3c Task 6).
//!
//! CRUD mirrors the S3b inventory handlers — thin adapters over
//! the use cases. `/suggestions` is a read-only computed endpoint
//! driven by `GenerateReorderSuggestionsUseCase`.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    CreateReorderRuleUseCase, DeleteReorderRuleUseCase,
    GenerateReorderSuggestionsUseCase, GetReorderRuleUseCase,
    ListReorderRulesUseCase, NewReorderRule, ReorderRuleUpdate,
    SuggestionOptions, UpdateReorderRuleUseCase,
};
use rf_domain::{
    MaterialTypeId, ReorderRule, ReorderRuleId, ReorderSuggestion, SupplierId,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReorderRuleDto {
    pub id: String,
    pub material_type_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier_id: Option<String>,
    pub reorder_point: f64,
    pub reorder_quantity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_stock_level: Option<f64>,
    pub lead_time_days: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safety_stock_days: Option<i32>,
    pub auto_reorder: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_triggered_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<ReorderRule> for ReorderRuleDto {
    fn from(r: ReorderRule) -> Self {
        Self {
            id: r.id.0,
            material_type_id: r.material_type_id.0,
            supplier_id: r.supplier_id.map(|s| s.0),
            reorder_point: r.reorder_point,
            reorder_quantity: r.reorder_quantity,
            max_stock_level: r.max_stock_level,
            lead_time_days: r.lead_time_days,
            safety_stock_days: r.safety_stock_days,
            auto_reorder: r.auto_reorder,
            active: r.active,
            notes: r.notes,
            last_triggered_at: r.last_triggered_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateReorderRuleBody {
    pub material_type_id: String,
    #[serde(default)]
    pub supplier_id: Option<String>,
    pub reorder_point: f64,
    pub reorder_quantity: f64,
    #[serde(default)]
    pub max_stock_level: Option<f64>,
    pub lead_time_days: i32,
    #[serde(default)]
    pub safety_stock_days: Option<i32>,
    #[serde(default)]
    pub auto_reorder: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<CreateReorderRuleBody> for NewReorderRule {
    fn from(b: CreateReorderRuleBody) -> Self {
        Self {
            material_type_id: MaterialTypeId(b.material_type_id),
            supplier_id: b.supplier_id.map(SupplierId),
            reorder_point: b.reorder_point,
            reorder_quantity: b.reorder_quantity,
            max_stock_level: b.max_stock_level,
            lead_time_days: b.lead_time_days,
            safety_stock_days: b.safety_stock_days,
            auto_reorder: b.auto_reorder,
            active: b.active,
            notes: b.notes,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct UpdateReorderRuleBody {
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub reorder_point: Option<f64>,
    #[serde(default)]
    pub reorder_quantity: Option<f64>,
    #[serde(default)]
    pub max_stock_level: Option<f64>,
    #[serde(default)]
    pub lead_time_days: Option<i32>,
    #[serde(default)]
    pub safety_stock_days: Option<i32>,
    #[serde(default)]
    pub auto_reorder: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<UpdateReorderRuleBody> for ReorderRuleUpdate {
    fn from(b: UpdateReorderRuleBody) -> Self {
        Self {
            // The HTTP surface can't distinguish omitted from
            // explicit-null today (same trade-off as other Update
            // bodies in this crate). Callers clear a field by
            // omitting it from the PATCH; null-clearing lives in
            // a follow-up if the UI ever needs it.
            supplier_id: b.supplier_id.map(|s| Some(SupplierId(s))),
            reorder_point: b.reorder_point,
            reorder_quantity: b.reorder_quantity,
            max_stock_level: b.max_stock_level.map(Some),
            lead_time_days: b.lead_time_days,
            safety_stock_days: b.safety_stock_days.map(Some),
            auto_reorder: b.auto_reorder,
            active: b.active,
            notes: b.notes.map(Some),
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReorderSuggestionDto {
    pub rule_id: String,
    pub material_type_id: String,
    pub material_name: String,
    pub current_stock_sqft: f64,
    pub threshold_sqft: f64,
    pub reorder_quantity_sqft: f64,
    pub urgency: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub days_until_stockout: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier_name: Option<String>,
    pub pending_quantity_sqft: f64,
    pub has_pending_po: bool,
}

impl From<ReorderSuggestion> for ReorderSuggestionDto {
    fn from(s: ReorderSuggestion) -> Self {
        Self {
            rule_id: s.rule_id.0,
            material_type_id: s.material_type_id.0,
            material_name: s.material_name,
            current_stock_sqft: s.current_stock_sqft,
            threshold_sqft: s.threshold_sqft,
            reorder_quantity_sqft: s.reorder_quantity_sqft,
            urgency: match s.urgency {
                rf_domain::Urgency::Critical => "critical".into(),
                rf_domain::Urgency::High => "high".into(),
                rf_domain::Urgency::Medium => "medium".into(),
                rf_domain::Urgency::Low => "low".into(),
            },
            days_until_stockout: s.days_until_stockout,
            estimated_cost: s.estimated_cost,
            supplier_id: s.supplier_id.map(|x| x.0),
            supplier_name: s.supplier_name,
            pending_quantity_sqft: s.pending_quantity_sqft,
            has_pending_po: s.has_pending_po,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ReorderSuggestionsQuery {
    /// Default `false` — rules with at least one non-draft PO
    /// line item are excluded. Set to `true` to show them anyway
    /// (the UI's "review pending" affordance).
    #[serde(default)]
    pub include_pending: bool,
}

// ---- list / get / create / update / delete -------------------------------

#[utoipa::path(
    get,
    path = "/api/v2/reorder-rules",
    tag = "procurement",
    responses(
        (status = 200, description = "All reorder rules", body = [ReorderRuleDto]),
        (status = 401, description = "Missing or invalid bearer token"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_reorder_rules(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<Vec<ReorderRuleDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .reorder_rules(auth)
        .map_err(ApiError::App)?;
    let use_case = ListReorderRulesUseCase::new(port);
    let rows = use_case.execute().await.map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(ReorderRuleDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/reorder-rules/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Reorder rule UUID")),
    responses(
        (status = 200, description = "Rule", body = ReorderRuleDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_reorder_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<ReorderRuleDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .reorder_rules(auth)
        .map_err(ApiError::App)?;
    let use_case = GetReorderRuleUseCase::new(port);
    let r = use_case
        .execute(ReorderRuleId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(r.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/reorder-rules",
    tag = "procurement",
    request_body = CreateReorderRuleBody,
    responses(
        (status = 201, description = "Created", body = ReorderRuleDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "DUPLICATE_MATERIAL_RULE, CHECK_VIOLATION, or FK_VIOLATION_PARENT_MISSING"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_reorder_rule(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<ReorderRuleDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateReorderRuleBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .procurement_factory
        .reorder_rules(&auth)
        .map_err(ApiError::App)?;
    let use_case = CreateReorderRuleUseCase::new(port);
    let r = use_case
        .execute(incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(r.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/reorder-rules/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Reorder rule UUID")),
    request_body = UpdateReorderRuleBody,
    responses(
        (status = 200, description = "Updated", body = ReorderRuleDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
        (status = 409, description = "CHECK_VIOLATION or FK_VIOLATION_PARENT_MISSING"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_reorder_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<ReorderRuleDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdateReorderRuleBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .procurement_factory
        .reorder_rules(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdateReorderRuleUseCase::new(port);
    let r = use_case
        .execute(ReorderRuleId(id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(r.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/reorder-rules/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Reorder rule UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_reorder_rule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .reorder_rules(auth)
        .map_err(ApiError::App)?;
    let use_case = DeleteReorderRuleUseCase::new(port);
    use_case
        .execute(ReorderRuleId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}

// ---- suggestions ---------------------------------------------------------

#[utoipa::path(
    get,
    path = "/api/v2/reorder-rules/suggestions",
    tag = "procurement",
    params(ReorderSuggestionsQuery),
    responses(
        (status = 200, description = "Suggestions (sorted by urgency)", body = [ReorderSuggestionDto]),
        (status = 401, description = "Missing or invalid bearer token"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn reorder_suggestions(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ReorderSuggestionsQuery>,
    req: Request,
) -> Result<Json<Vec<ReorderSuggestionDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let rules = state
        .procurement_factory
        .reorder_rules(auth)
        .map_err(ApiError::App)?;
    let reads = state
        .procurement_factory
        .suggestion_reads(auth)
        .map_err(ApiError::App)?;
    let use_case = GenerateReorderSuggestionsUseCase::new(rules, reads);
    let suggestions = use_case
        .execute(SuggestionOptions {
            include_pending: q.include_pending,
        })
        .await
        .map_err(ApiError::App)?;
    Ok(Json(
        suggestions
            .into_iter()
            .map(ReorderSuggestionDto::from)
            .collect(),
    ))
}
