//! HTTP handlers for the cut-history slice — first vertical test of
//! the full Rust-backend path per S3a Task 6.
//!
//! Each handler: extracts the request-scoped `AuthContext`, asks the
//! state's `CutHistoryPortFactory` for a request-scoped port, wraps
//! it in an `Arc`, constructs the relevant use case, and returns the
//! response as a DTO. Swapping the factory for a fake is how tests
//! avoid touching Supabase.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rf_application::cuts::{
    GetCutHistoryItemUseCase, ListCutHistoryUseCase, ListFavoritesUseCase,
};
use rf_application::error::AppError;
use rf_domain::{CutHistoryEntry, CutHistoryFilters, CutHistoryId, UserId};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState, AuthError};

/// Query params for `/api/v2/cuts/history`. Named distinctly from the
/// domain `CutHistoryFilters` because the HTTP surface exposes a
/// narrow camelCase-friendly subset and maps it before delegating.
#[derive(Debug, Default, Deserialize, IntoParams)]
pub struct ListHistoryQuery {
    /// Page size. Clamped to 200 server-side; defaults to 50 when omitted.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Zero-based offset from the newest entry.
    #[serde(default)]
    pub offset: Option<u32>,
    /// Lower bound on `cut_date` (ISO-8601, inclusive).
    #[serde(default)]
    pub since: Option<String>,
    /// Upper bound on `cut_date` (ISO-8601, inclusive).
    #[serde(default)]
    pub until: Option<String>,
}

impl From<ListHistoryQuery> for CutHistoryFilters {
    fn from(q: ListHistoryQuery) -> Self {
        CutHistoryFilters {
            limit: q.limit,
            offset: q.offset,
            since: q.since,
            until: q.until,
        }
    }
}

/// Response DTO — thin wrapper over the domain entry. Separated from
/// `CutHistoryEntry` so the HTTP contract can evolve independently
/// of domain schema. Today the mapping is 1:1; renaming / derived
/// fields will land here first when we start splitting concerns.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct CutHistoryDto {
    pub id: i64,
    pub user_id: Option<String>,
    pub material_id: i32,
    pub part_id: i32,
    pub cut_length: f64,
    pub cut_width: f64,
    pub cut_thickness: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_custom_width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_custom_height: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_selected_size: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_selected_size_text: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub part_selected_label: Option<Vec<String>>,
    pub cut_amount: i32,
    pub parts_completed: i32,
    pub material_used_sqft: f64,
    pub reusable_offset_sqft: f64,
    pub scrap_sqft: f64,
    pub fab_score: f64,
    pub cut_pieces: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cut_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<CutHistoryEntry> for CutHistoryDto {
    fn from(e: CutHistoryEntry) -> Self {
        CutHistoryDto {
            id: e.id.0,
            user_id: e.user_id.map(|u| u.0),
            material_id: e.material_id,
            part_id: e.part_id,
            cut_length: e.cut_length,
            cut_width: e.cut_width,
            cut_thickness: e.cut_thickness,
            part_custom_width: e.part_custom_width,
            part_custom_height: e.part_custom_height,
            part_selected_size: e.part_selected_size,
            part_selected_size_text: e.part_selected_size_text,
            part_selected_label: e.part_selected_label,
            cut_amount: e.cut_amount,
            parts_completed: e.parts_completed,
            material_used_sqft: e.material_used_sqft,
            reusable_offset_sqft: e.reusable_offset_sqft,
            scrap_sqft: e.scrap_sqft,
            fab_score: e.fab_score,
            cut_pieces: e.cut_pieces,
            cut_date: e.cut_date,
            created_at: e.created_at,
            updated_at: e.updated_at,
        }
    }
}

/// Extract `UserId` from the already-verified `AuthContext`.
fn user_id_from(auth: &crate::AuthContext) -> UserId {
    UserId(auth.claims.sub.clone())
}

#[utoipa::path(
    get,
    path = "/api/v2/cuts/history",
    tag = "cuts",
    params(ListHistoryQuery),
    responses(
        (status = 200, description = "Cut-history entries, newest first", body = [CutHistoryDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_history(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListHistoryQuery>,
    req: Request,
) -> Result<Json<Vec<CutHistoryDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .cut_history_factory
        .build(auth)
        .map_err(ApiError::App)?;
    let user_id = user_id_from(auth);
    let use_case = ListCutHistoryUseCase::new(port);
    let entries = use_case
        .execute(&user_id, params.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(entries.into_iter().map(CutHistoryDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/cuts/history/{id}",
    tag = "cuts",
    params(("id" = i64, Path, description = "Cut-history row id")),
    responses(
        (status = 200, description = "The cut-history entry", body = CutHistoryDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found or hidden by RLS"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_history_item(
    State(state): State<Arc<AppState>>,
    Path(id): Path<i64>,
    req: Request,
) -> Result<Json<CutHistoryDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .cut_history_factory
        .build(auth)
        .map_err(ApiError::App)?;
    let user_id = user_id_from(auth);
    let use_case = GetCutHistoryItemUseCase::new(port);
    let entry = use_case
        .execute(&user_id, CutHistoryId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(entry.into()))
}

#[utoipa::path(
    get,
    path = "/api/v2/cuts/favorites",
    tag = "cuts",
    responses(
        (status = 200, description = "Favorited cut-history entries", body = [CutHistoryDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_favorites(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<Vec<CutHistoryDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .cut_history_factory
        .build(auth)
        .map_err(ApiError::App)?;
    let user_id = user_id_from(auth);
    let use_case = ListFavoritesUseCase::new(port);
    let entries = use_case.execute(&user_id).await.map_err(ApiError::App)?;
    Ok(Json(entries.into_iter().map(CutHistoryDto::from).collect()))
}

/// HTTP error wrapper — maps application errors to status codes so
/// the handler signatures stay clean. Keeping it local to this
/// module until a second resource needs the same mapping.
#[derive(Debug)]
pub enum ApiError {
    Auth(AuthError),
    App(AppError),
}

impl From<AuthError> for ApiError {
    fn from(e: AuthError) -> Self {
        ApiError::Auth(e)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::Auth(e) => e.into_response(),
            ApiError::App(AppError::NotFound) => {
                (StatusCode::NOT_FOUND, "not found").into_response()
            }
            ApiError::App(AppError::Forbidden) => {
                (StatusCode::FORBIDDEN, "forbidden").into_response()
            }
            ApiError::App(AppError::InvalidInput(msg)) => {
                (StatusCode::BAD_REQUEST, msg).into_response()
            }
            ApiError::App(AppError::Conflict(code)) => {
                // Stable machine code in the body so the UI can
                // localize its own message. No dependent-row counts
                // or table names leak — those belong in dedicated
                // "can delete?" endpoints, not the error channel.
                let body = serde_json::json!({ "code": code });
                (StatusCode::CONFLICT, Json(body)).into_response()
            }
            ApiError::App(AppError::Infrastructure(_)) => {
                // Don't leak adapter error strings to the client — a
                // generic 500 is safer. The full message is already
                // logged by the handler's surrounding middleware.
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error").into_response()
            }
        }
    }
}
