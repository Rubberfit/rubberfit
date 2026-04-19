//! HTTP handlers for `/api/v2/inventory/rolls`.
//!
//! Server-side hydration of the denormalized `material_type` column:
//! when the caller sends `material_type_id` (on create or update),
//! the handler looks up the referenced row's `name` and stamps it
//! into the write alongside the id. Any client-supplied
//! `material_type` string in the body is IGNORED — the server is
//! the single source of truth for this field.
//!
//! Depletion: setting `status = "depleted"` requires
//! `remaining_length <= 0.001` in the same body. The application
//! layer rejects 400 `INVALID_DEPLETION_STATE` otherwise; the DB
//! trigger `rolls_check_depletion` gates the notification on this
//! exact condition.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::inventory::{
    CreateRollUseCase, DeleteRollUseCase, GetMaterialTypeUseCase, GetRollUseCase,
    ListRollsUseCase, NewRoll, RollUpdate, UpdateRollUseCase,
};
use rf_domain::{MaterialTypeId, Roll, RollFilters, RollId, RollStatus};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState, AuthContext};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct RollDto {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_type_id: Option<String>,
    pub material_type: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_received: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cost_per_sqft: Option<f64>,
    pub remaining_length: f64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

fn status_to_str(s: RollStatus) -> &'static str {
    match s {
        RollStatus::Active => "active",
        RollStatus::Depleted => "depleted",
        RollStatus::Reserved => "reserved",
    }
}

impl From<Roll> for RollDto {
    fn from(r: Roll) -> Self {
        Self {
            id: r.id.0,
            material_type_id: r.material_type_id.map(|m| m.0),
            material_type: r.material_type,
            width: r.width,
            length: r.length,
            thickness: r.thickness,
            color: r.color,
            location: r.location,
            date_received: r.date_received,
            supplier: r.supplier,
            cost_per_sqft: r.cost_per_sqft,
            remaining_length: r.remaining_length,
            status: status_to_str(r.status).to_string(),
            notes: r.notes,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}

#[derive(Debug, Default, Deserialize, IntoParams)]
pub struct ListRollsQuery {
    /// Filter by status (active / depleted / reserved).
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub material_type_id: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    /// ILIKE sweep across material_type / color / location / supplier / notes.
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

fn parse_status(s: &str) -> Result<RollStatus, AppError> {
    match s {
        "active" => Ok(RollStatus::Active),
        "depleted" => Ok(RollStatus::Depleted),
        "reserved" => Ok(RollStatus::Reserved),
        other => Err(AppError::InvalidInput(format!(
            "unknown roll status {other:?}; expected active|depleted|reserved"
        ))),
    }
}

impl TryFrom<ListRollsQuery> for RollFilters {
    type Error = AppError;
    fn try_from(q: ListRollsQuery) -> Result<Self, AppError> {
        Ok(Self {
            status: q.status.as_deref().map(parse_status).transpose()?,
            material_type_id: q.material_type_id.map(MaterialTypeId),
            location: q.location,
            search: q.q,
            limit: q.limit,
            offset: q.offset,
        })
    }
}

/// Create body. Caller sends `material_type_id`; the server looks
/// up the corresponding name. Any `material_type` string in the
/// body is ignored.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateRollBody {
    pub material_type_id: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub date_received: Option<String>,
    #[serde(default)]
    pub supplier: Option<String>,
    #[serde(default)]
    pub cost_per_sqft: Option<f64>,
    pub remaining_length: f64,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

#[derive(Debug, Default, Clone, Deserialize, ToSchema)]
pub struct UpdateRollBody {
    #[serde(default)]
    pub material_type_id: Option<String>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub length: Option<f64>,
    #[serde(default)]
    pub thickness: Option<f64>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub date_received: Option<String>,
    #[serde(default)]
    pub supplier: Option<String>,
    #[serde(default)]
    pub cost_per_sqft: Option<f64>,
    #[serde(default)]
    pub remaining_length: Option<f64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

/// Look up the name of the material type referenced by an id. Errors
/// map to 400 (not 409) because from the caller's point of view a
/// bad `material_type_id` is an invalid input, not a storage
/// conflict — the FK violation path is a server-internal concern.
async fn lookup_material_type_name(
    state: &AppState,
    auth: &AuthContext,
    material_type_id: &str,
) -> Result<String, ApiError> {
    let port = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let uc = GetMaterialTypeUseCase::new(port);
    match uc.execute(MaterialTypeId(material_type_id.to_string())).await {
        Ok(mt) => Ok(mt.name),
        Err(AppError::NotFound) => Err(ApiError::App(AppError::InvalidInput(format!(
            "unknown material_type_id {material_type_id:?}"
        )))),
        Err(other) => Err(ApiError::App(other)),
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls",
    tag = "inventory",
    params(ListRollsQuery),
    responses(
        (status = 200, description = "Matching rolls", body = [RollDto]),
        (status = 400, description = "Bad filter (unknown status)"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_rolls(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListRollsQuery>,
    req: Request,
) -> Result<Json<Vec<RollDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let filters: RollFilters = params.try_into().map_err(ApiError::App)?;
    let port = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let uc = ListRollsUseCase::new(port);
    let rows = uc.execute(filters).await.map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(RollDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Roll UUID")),
    responses(
        (status = 200, description = "The roll", body = RollDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_roll(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<RollDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let uc = GetRollUseCase::new(port);
    let r = uc.execute(RollId(id)).await.map_err(ApiError::App)?;
    Ok(Json(r.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/inventory/rolls",
    tag = "inventory",
    request_body = CreateRollBody,
    responses(
        (status = 201, description = "Created", body = RollDto),
        (status = 400, description = "Validation failed or unknown material_type_id"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "FK conflict / check violation"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_roll(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<RollDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateRollBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let status = incoming
        .status
        .as_deref()
        .map(parse_status)
        .transpose()
        .map_err(ApiError::App)?;
    let material_type_name =
        lookup_material_type_name(&state, &auth, &incoming.material_type_id).await?;

    let new = NewRoll {
        material_type_id: Some(incoming.material_type_id),
        material_type: material_type_name,
        width: incoming.width,
        length: incoming.length,
        thickness: incoming.thickness,
        color: incoming.color,
        location: incoming.location,
        date_received: incoming.date_received,
        supplier: incoming.supplier,
        cost_per_sqft: incoming.cost_per_sqft,
        remaining_length: incoming.remaining_length,
        status,
        notes: incoming.notes,
    };

    let port = state
        .inventory_factory
        .rolls(&auth)
        .map_err(ApiError::App)?;
    let uc = CreateRollUseCase::new(port);
    let r = uc.execute(new).await.map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(r.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/inventory/rolls/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Roll UUID")),
    request_body = UpdateRollBody,
    responses(
        (status = 200, description = "Updated", body = RollDto),
        (status = 400, description = "Validation failed / invalid depletion state"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_roll(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<RollDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdateRollBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let status = incoming
        .status
        .as_deref()
        .map(parse_status)
        .transpose()
        .map_err(ApiError::App)?;

    // Material-type name hydration: if the update changes
    // material_type_id, look up the new name and stamp it so the
    // denormalized column stays in sync.
    let material_type_name = if let Some(mt_id) = incoming.material_type_id.as_deref() {
        Some(lookup_material_type_name(&state, &auth, mt_id).await?)
    } else {
        None
    };

    let patch = RollUpdate {
        material_type_id: incoming.material_type_id.clone().map(Some),
        material_type: material_type_name,
        width: incoming.width,
        length: incoming.length,
        thickness: incoming.thickness,
        color: incoming.color.map(Some),
        location: incoming.location.map(Some),
        date_received: incoming.date_received.map(Some),
        supplier: incoming.supplier.map(Some),
        cost_per_sqft: incoming.cost_per_sqft.map(Some),
        remaining_length: incoming.remaining_length,
        status,
        notes: incoming.notes.map(Some),
    };

    let port = state
        .inventory_factory
        .rolls(&auth)
        .map_err(ApiError::App)?;
    let uc = UpdateRollUseCase::new(port);
    let r = uc
        .execute(RollId(id), patch)
        .await
        .map_err(ApiError::App)?;
    Ok(Json(r.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/inventory/rolls/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Roll UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_roll(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let uc = DeleteRollUseCase::new(port);
    uc.execute(RollId(id)).await.map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
