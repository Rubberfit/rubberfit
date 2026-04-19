//! Inventory stats endpoints — derived views over the rolls +
//! material_types ports. Separate submodule so the routes tree
//! stays tidy under `/api/v2/inventory/rolls/stats/...` and the
//! DTOs don't compete with the main rolls surface.

use std::sync::Arc;

use axum::extract::{Query, Request, State};
use axum::Json;
use rf_application::inventory::{
    InventoryGrowthUseCase, InventoryValueUseCase, LowStockCountUseCase,
    RecentRollsUseCase,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;
use crate::inventory::rolls::RollDto;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct InventoryValueDto {
    /// Total value in USD.
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct LowStockCountDto {
    pub count: u64,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct InventoryGrowthDto {
    /// Percentage growth vs. the prior 7 days.
    pub percentage: f64,
}

#[derive(Debug, Default, Deserialize, IntoParams)]
pub struct RecentRollsQuery {
    /// Number of rows to return. Clamped server-side to 200.
    #[serde(default)]
    pub limit: Option<u32>,
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls/stats/inventory-value",
    tag = "inventory",
    responses(
        (status = 200, description = "Total inventory value in USD", body = InventoryValueDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn inventory_value(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<InventoryValueDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let rolls = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let mts = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let uc = InventoryValueUseCase::new(rolls, mts);
    let value = uc.execute().await.map_err(ApiError::App)?;
    Ok(Json(InventoryValueDto { value }))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls/stats/low-stock-count",
    tag = "inventory",
    responses(
        (status = 200, description = "Count of material types below their min_stock_alert threshold", body = LowStockCountDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn low_stock_count(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<LowStockCountDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let rolls = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let mts = state
        .inventory_factory
        .material_types(auth)
        .map_err(ApiError::App)?;
    let uc = LowStockCountUseCase::new(rolls, mts);
    let count = uc.execute().await.map_err(ApiError::App)?;
    Ok(Json(LowStockCountDto { count }))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls/stats/growth-percentage",
    tag = "inventory",
    responses(
        (status = 200, description = "Roll-count growth percentage, last-7d vs previous-7d", body = InventoryGrowthDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn inventory_growth(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<InventoryGrowthDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let rolls = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let uc = InventoryGrowthUseCase::new(rolls);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let percentage = uc.execute(now).await.map_err(ApiError::App)?;
    Ok(Json(InventoryGrowthDto { percentage }))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/rolls/recent",
    tag = "inventory",
    params(RecentRollsQuery),
    responses(
        (status = 200, description = "Most-recent active rolls by created_at", body = [RollDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn recent_rolls(
    State(state): State<Arc<AppState>>,
    Query(params): Query<RecentRollsQuery>,
    req: Request,
) -> Result<Json<Vec<RollDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let rolls = state.inventory_factory.rolls(auth).map_err(ApiError::App)?;
    let uc = RecentRollsUseCase::new(rolls);
    let limit = params.limit.unwrap_or(10);
    let rows = uc.execute(limit).await.map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(RollDto::from).collect()))
}
