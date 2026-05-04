//! `/health` — unauthenticated liveness probe.
//!
//! Reports the binary's build version so deployers can verify they
//! hit the crate they expect after a Fly deploy or a Tauri rebuild.
//! Explicitly does NOT touch Supabase — this endpoint must return
//! 200 even if the database is unreachable, so upstream load
//! balancers can keep routing traffic while background reconnection
//! happens.

use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Debug, Serialize, ToSchema)]
pub struct Health {
    pub status: &'static str,
    pub version: &'static str,
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "meta",
    responses((status = 200, description = "Service liveness", body = Health))
)]
pub async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}
