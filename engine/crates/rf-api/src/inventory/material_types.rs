//! HTTP handlers for `/api/v2/inventory/material-types`.
//!
//! Thin adapters between the HTTP surface and the use cases in
//! `rf-application::inventory::material_types`. Each handler:
//!
//! 1. Extracts the `AuthContext` the JWT middleware installed.
//! 2. Asks `state.inventory_factory.material_types(auth)` for a
//!    request-scoped port (production wraps a per-request
//!    `PostgrestClient`; tests inject fakes).
//! 3. Hands the port to the relevant use case.
//! 4. Maps the result to a `MaterialTypeDto` (or a unit response
//!    for delete).

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::inventory::{
    CreateMaterialTypeUseCase, DeleteMaterialTypeUseCase, GetMaterialTypeUseCase,
    ListMaterialTypesUseCase, MaterialTypeUpdate, NewMaterialType, UpdateMaterialTypeUseCase,
};
use rf_domain::{MaterialType, MaterialTypeId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

/// Response DTO — mirrors the domain struct 1:1 today. Separated
/// from `MaterialType` so the HTTP contract can evolve without
/// reaching into the domain type.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MaterialTypeDto {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_stock_alert: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<MaterialType> for MaterialTypeDto {
    fn from(mt: MaterialType) -> Self {
        Self {
            id: mt.id.0,
            name: mt.name,
            description: mt.description,
            default_cost: mt.default_cost,
            min_stock_alert: mt.min_stock_alert,
            created_at: mt.created_at,
            updated_at: mt.updated_at,
        }
    }
}

/// Request body for POST — mandatory `name`, everything else
/// optional. The handler validates constraints through the use
/// case; the adapter maps a DB unique violation to a stable
/// `DUPLICATE_NAME` conflict code.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateMaterialTypeBody {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default_cost: Option<f64>,
    #[serde(default)]
    pub min_stock_alert: Option<f64>,
}

impl From<CreateMaterialTypeBody> for NewMaterialType {
    fn from(b: CreateMaterialTypeBody) -> Self {
        Self {
            name: b.name,
            description: b.description,
            default_cost: b.default_cost,
            min_stock_alert: b.min_stock_alert,
        }
    }
}

/// Request body for PUT. Every field is optional so the HTTP surface
/// can evolve to PATCH semantics later without breaking callers —
/// for now, the UI always sends a full replacement. Nullable fields
/// use `Option<Option<T>>` via `serde_with`-style manual handling:
/// `null` in JSON explicitly clears the column, omitted means leave
/// as-is.
///
/// To keep the DTO simple we expose the fields as plain `Option<T>`
/// here. Semantics: present-and-non-null replaces the column,
/// present-and-null is the same as omitting (the UI today never
/// needs to explicitly null a column). If that distinction matters
/// later we'll promote to `Option<Option<T>>` + a custom visitor.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct UpdateMaterialTypeBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub default_cost: Option<f64>,
    #[serde(default)]
    pub min_stock_alert: Option<f64>,
}

impl From<UpdateMaterialTypeBody> for MaterialTypeUpdate {
    fn from(b: UpdateMaterialTypeBody) -> Self {
        Self {
            name: b.name,
            description: b.description.map(Some),
            default_cost: b.default_cost.map(Some),
            min_stock_alert: b.min_stock_alert.map(Some),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/material-types",
    tag = "inventory",
    responses(
        (status = 200, description = "All material types, ordered by name", body = [MaterialTypeDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_material_types(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<Vec<MaterialTypeDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let use_case = ListMaterialTypesUseCase::new(port);
    let rows = use_case.execute().await.map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(MaterialTypeDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/material-types/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-type UUID")),
    responses(
        (status = 200, description = "The material type", body = MaterialTypeDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found or hidden by RLS"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_material_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<MaterialTypeDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let use_case = GetMaterialTypeUseCase::new(port);
    let mt = use_case
        .execute(MaterialTypeId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(mt.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/inventory/material-types",
    tag = "inventory",
    request_body = CreateMaterialTypeBody,
    responses(
        (status = 201, description = "Created", body = MaterialTypeDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "Duplicate name — `DUPLICATE_NAME` code in body"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_material_type(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<MaterialTypeDto>), ApiError> {
    // Clone the AuthContext up front so we can consume the request's
    // body afterwards. `require_auth` borrows from the request, but
    // reading the body moves the request — the clone lets both
    // happen in sequence without tangling lifetimes.
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();

    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateMaterialTypeBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .inventory_factory
        .material_types(&auth)
        .map_err(ApiError::App)?;
    let use_case = CreateMaterialTypeUseCase::new(port);
    let mt = use_case
        .execute(incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(mt.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/inventory/material-types/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-type UUID")),
    request_body = UpdateMaterialTypeBody,
    responses(
        (status = 200, description = "Updated", body = MaterialTypeDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 409, description = "Duplicate name — `DUPLICATE_NAME` code in body"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_material_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<MaterialTypeDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdateMaterialTypeBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .inventory_factory
        .material_types(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdateMaterialTypeUseCase::new(port);
    let mt = use_case
        .execute(MaterialTypeId(id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(mt.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/inventory/material-types/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-type UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 409, description = "Blocked — rolls reference this type (`FK_VIOLATION_ROLLS_EXIST`)"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_material_type(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let use_case = DeleteMaterialTypeUseCase::new(port);
    use_case
        .execute(MaterialTypeId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
